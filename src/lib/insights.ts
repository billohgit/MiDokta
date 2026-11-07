import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * What the clinic sees most: diagnoses from visit records, medicines doctors prescribe, and
 * medicines patients buy in the pharmacy shop. Diagnoses and medicine names are typed freely, so
 * they're grouped by a normalised key ("Malaria." and "malaria" count together; medicines are
 * grouped without their strength or form), and each group is shown under its most common spelling.
 */

export const PERIODS = { "30": "Last 30 days", "90": "Last 90 days", "365": "Last 12 months", all: "All time" } as const;
export type Period = keyof typeof PERIODS;

export type Ranked = { label: string; count: number; /** Distinct patients, where it applies. */ patients?: number };

const TOP = 15;

/** "Malaria." / " MALARIA " -> "malaria". */
const diagnosisKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[.;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * A strength or amount: a word that starts with a digit ("500mg", "1g", "500 mg", "250/125"). Names
 * with digits inside, like "B12", are kept.
 */
const STRENGTH = /(^|\s)\d[\d.,/]*\s*(mg|mcg|g|ml|iu|%|units?)?(?=\s|$)/gi;
const withoutStrength = (s: string) => s.replace(STRENGTH, " ").replace(/\s+/g, " ").trim() || s;

/** "Paracetamol 500mg tablets" / "PARACETAMOL" -> "paracetamol": the drug, without strength or form. */
const FORM_WORDS = /\b(tabs?|tablets?|caps?|capsules?|syrup|susp(ension)?|inj(ection)?|cream|ointment|drops?|sachets?|packs?|bottles?|vials?|sprays?|mg|ml|mcg|g|iu|units?)\b/g;
export const medicineKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(STRENGTH, " ")
    .replace(FORM_WORDS, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Counts items by key, labelled with each key's most common original spelling, biggest first. */
function rank<T>(rows: T[], key: (r: T) => string, label: (r: T) => string, weight: (r: T) => number = () => 1, patient?: (r: T) => string) {
  const groups = new Map<string, { count: number; spellings: Map<string, number>; patients: Set<string> }>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const g = groups.get(k) ?? { count: 0, spellings: new Map(), patients: new Set() };
    g.count += weight(r);
    const original = label(r).trim().replace(/[.;:!?]+$/, "");
    g.spellings.set(original, (g.spellings.get(original) ?? 0) + 1);
    if (patient) g.patients.add(patient(r));
    groups.set(k, g);
  }
  return [...groups.values()]
    .map((g) => ({
      label: [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
      count: g.count,
      ...(patient ? { patients: g.patients.size } : {}),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

const SOLD = ["PAID", "DISPATCHED", "DELIVERED", "RECEIVED", "DISPUTED"] as const;

export async function clinicInsights(period: Period) {
  const since = period === "all" ? undefined : new Date(Date.now() - Number(period) * 86400_000);
  const createdAt = since ? { gte: since } : undefined;

  const [records, prescriptions, sold] = await Promise.all([
    prisma.medicalRecord.findMany({ where: { createdAt }, select: { diagnosis: true, patientId: true } }),
    prisma.prescription.findMany({ where: { record: { createdAt } }, select: { medication: true, record: { select: { patientId: true } } } }),
    prisma.pharmacyOrderItem.findMany({
      where: { order: { status: { in: [...SOLD] }, paidAt: since ? { gte: since } : { not: null } } },
      select: { name: true, quantity: true, order: { select: { patientId: true } } },
    }),
  ]);

  const diagnoses = rank(records, (r) => diagnosisKey(r.diagnosis), (r) => r.diagnosis, undefined, (r) => r.patientId);
  const prescribed = rank(prescriptions, (p) => medicineKey(p.medication), (p) => withoutStrength(p.medication), undefined, (p) => p.record.patientId);
  const bought = rank(sold, (i) => medicineKey(i.name), (i) => withoutStrength(i.name), (i) => i.quantity, (i) => i.order.patientId);

  return {
    totals: {
      visits: records.length,
      patients: new Set(records.map((r) => r.patientId)).size,
      prescriptions: prescriptions.length,
      unitsSold: sold.reduce((n, i) => n + i.quantity, 0),
      distinctDiagnoses: diagnoses.length,
    },
    diagnoses: diagnoses.slice(0, TOP),
    prescribed: prescribed.slice(0, TOP),
    bought: bought.slice(0, TOP),
  };
}
