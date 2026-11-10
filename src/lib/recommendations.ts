import "server-only";

import { Role, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { matchCondition } from "@/lib/conditions";
import { medicineKey } from "@/lib/insights";

/**
 * Suggestions for a patient's own "main illness": doctors and medicines, from two sources.
 *
 * - The common-conditions list (src/lib/conditions.ts): which kinds of doctor treat it, and the
 *   medicines commonly used, each marked over-the-counter or prescription-only.
 * - The clinic's own records: doctors who have diagnosed it, and what they prescribed for it.
 *
 * Prescription-only medicines are shown for information only; the patient is pointed to a doctor.
 */

export type DoctorSuggestion = {
  id: string;
  name: string;
  specialty: string | null;
  /** Formatted, or null when booking is free. */
  fee: string | null;
  /** Visits where this doctor recorded the illness. */
  treated: number;
  rating: number | null;
};

export type ProductOption = { id: string; name: string; detail: string; price: string; inStock: number; pharmacyName: string };

export type MedicineSuggestion = {
  name: string;
  otc: boolean;
  note: string | null;
  /** How many times the clinic's doctors prescribed it for this illness. */
  prescribedHere: number;
  products: ProductOption[];
};

export type Recommendations = { condition: string; known: boolean; doctors: DoctorSuggestion[]; medicines: MedicineSuggestion[] };

const MAX_DOCTORS = 4;
const MAX_MEDICINES = 6;
/** Words too general to search diagnoses by on their own. */
const TOO_GENERAL = new Set(["pain", "bp", "acid", "eye", "cold", "sugar", "pressure", "stress", "rash", "itching", "worm", "fungal", "tb", "scd", "uti"]);

/** Diagnoses that mean this illness, as Prisma conditions on MedicalRecord.diagnosis. */
function diagnosisTerms(illness: string, synonyms: string[] | null): Prisma.MedicalRecordWhereInput {
  const terms = synonyms ? synonyms.filter((s) => s.length >= 4 && !TOO_GENERAL.has(s)) : [illness.trim()];
  return { OR: terms.map((t) => ({ diagnosis: { contains: t, mode: "insensitive" as const } })) };
}

export async function recommendationsFor(illness: string): Promise<Recommendations | null> {
  if (!illness.trim()) return null;
  const condition = matchCondition(illness);
  const matchesIllness = diagnosisTerms(illness, condition ? [condition.name.toLowerCase(), ...condition.synonyms] : null);

  const [experience, specialists, prescribed] = await Promise.all([
    prisma.medicalRecord.groupBy({ by: ["doctorId"], where: matchesIllness, _count: { _all: true } }),
    condition
      ? prisma.user.findMany({
          where: { role: Role.DOCTOR, isActive: true, OR: condition.specialties.map((s) => ({ specialty: { contains: s, mode: "insensitive" as const } })) },
          select: { id: true },
        })
      : Promise.resolve([]),
    prisma.prescription.findMany({ where: { record: matchesIllness }, select: { medication: true }, take: 2000 }),
  ]);

  // Doctors: those who've treated it most, then those whose specialty fits.
  const treated = new Map(experience.map((e) => [e.doctorId, e._count._all]));
  const specialistIds = new Set(specialists.map((s) => s.id));
  const candidateIds = [...new Set([...treated.keys(), ...specialistIds])];
  const [doctors, ratings] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: candidateIds }, role: Role.DOCTOR, isActive: true } }),
    prisma.doctorRating.groupBy({ by: ["doctorId"], where: { doctorId: { in: candidateIds } }, _avg: { stars: true } }),
  ]);
  const ratingOf = new Map(ratings.map((r) => [r.doctorId, r._avg.stars]));
  const doctorSuggestions = doctors
    .map((d) => ({
      id: d.id,
      name: `Dr. ${d.firstName} ${d.lastName}`,
      specialty: d.specialty,
      fee: d.consultationFee?.isPositive() ? formatMoney(d.consultationFee.toString()) : null,
      treated: treated.get(d.id) ?? 0,
      rating: ratingOf.get(d.id) ? Math.round(ratingOf.get(d.id)! * 10) / 10 : null,
      specialist: specialistIds.has(d.id),
    }))
    .sort((a, b) => b.treated - a.treated || Number(b.specialist) - Number(a.specialist) || (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, MAX_DOCTORS)
    .map(({ specialist: _s, ...d }) => d);

  // Medicines: what the clinic prescribes for it, then the commonly used ones. Anything not on the
  // list as over-the-counter is treated as prescription-only.
  const byKey = new Map<string, MedicineSuggestion>();
  const counts = new Map<string, { label: string; count: number }>();
  for (const p of prescribed) {
    const key = medicineKey(p.medication);
    if (!key) continue;
    const c = counts.get(key) ?? { label: p.medication.replace(/(^|\s)\d[\d.,/]*\s*(mg|mcg|g|ml|iu|%)?(?=\s|$)/gi, " ").trim(), count: 0 };
    c.count++;
    counts.set(key, c);
  }
  for (const [key, c] of [...counts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, MAX_MEDICINES)) {
    byKey.set(key, { name: c.label, otc: false, note: null, prescribedHere: c.count, products: [] });
  }
  for (const m of condition?.medicines ?? []) {
    const key = medicineKey(m.name);
    const known = byKey.get(key);
    if (known) Object.assign(known, { name: m.name, otc: m.otc, note: m.note ?? null });
    else byKey.set(key, { name: m.name, otc: m.otc, note: m.note ?? null, prescribedHere: 0, products: [] });
  }
  const medicines = [...byKey.values()]
    .sort((a, b) => b.prescribedHere - a.prescribedHere || Number(b.otc) - Number(a.otc))
    .slice(0, MAX_MEDICINES);

  // What's in stock for each, cheapest first.
  await Promise.all(
    medicines.map(async (m) => {
      const word = m.name.split(/[\s/-]+/)[0];
      if (word.length < 3) return;
      const products = await prisma.pharmacyProduct.findMany({
        where: { name: { contains: word, mode: "insensitive" }, isActive: true, quantity: { gt: 0 }, pharmacy: { isActive: true } },
        include: { pharmacy: { select: { name: true } } },
        orderBy: { price: "asc" },
        take: 3,
      });
      m.products = products.map((p) => ({
        id: p.id,
        name: p.name,
        detail: [p.strength, p.form].filter(Boolean).join(" · "),
        price: formatMoney(p.price.toString()),
        inStock: p.quantity,
        pharmacyName: p.pharmacy.name,
      }));
    }),
  );

  return { condition: condition?.name ?? illness.trim(), known: !!condition, doctors: doctorSuggestions, medicines };
}
