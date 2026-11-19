import "server-only";

import { Prisma, Role, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { feeOf } from "@/lib/consultations";
import { myUpcomingAppointments } from "@/lib/patient-portal";
import { contactsWhere } from "@/lib/chat";
import { formatDate, formatTime } from "@/components/appointments/shared";
import type { OmegaProposal } from "./types";

/**
 * What Omega can look up for a patient, and the actions it can offer them. Used by the AI's tools
 * and by Omega's basic mode (src/lib/omega/fallback.ts). Proposals are only offers: they are
 * checked here, and carried out by the patient tapping Confirm, which runs the app's own actions.
 */

const when = (d: Date) => `${formatDate(d.toISOString())} at ${formatTime(d.toISOString())}`;
const doctorName = (d: Pick<User, "firstName" | "lastName">) => `Dr. ${d.firstName} ${d.lastName}`;

// ---- Look-ups --------------------------------------------------------------------------------------

export async function upcomingAppointments(patientId: string) {
  const appts = await myUpcomingAppointments(patientId, 8);
  const paid = await prisma.consultation.findMany({ where: { appointmentId: { in: appts.map((a) => a.id) }, paidAt: { not: null } }, select: { appointmentId: true } });
  return appts.map((a) => ({
    id: a.id,
    title: a.title,
    startsAt: a.startsAt,
    label: `${a.title} with ${a.doctor ? doctorName(a.doctor) : "a doctor to be assigned"}, ${when(a.startsAt)}`,
    status: a.status === "PENDING" ? "requested, waiting for confirmation" : "confirmed",
    visit: a.visitType === "VIDEO_CALL" ? "video call" : "in person",
    doctor: a.doctor ? doctorName(a.doctor) : null,
    hospital: a.hospital?.name ?? null,
    paid: paid.some((p) => p.appointmentId === a.id),
  }));
}

/** Tests and referrals as the patient may see them: a result only once their doctor has told them. */
export async function testsAndReferrals(patientId: string) {
  const [tests, referrals] = await Promise.all([
    prisma.diagnosticTest.findMany({ where: { patientId, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, take: 10, include: { orderedBy: { select: { lastName: true } } } }),
    prisma.referral.findMany({ where: { patientId, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, take: 10, include: { toDoctor: true } }),
  ]);
  return {
    tests: tests.map((t) => {
      const ready = t.status === "COMMUNICATED";
      return {
        name: t.name,
        ordered: `${formatDate(t.createdAt.toISOString())} by Dr. ${t.orderedBy.lastName}`,
        status: ready ? "result ready" : t.status === "ORDERED" ? "waiting for the sample" : t.status === "COLLECTED" ? "waiting for the result" : "the doctor is reviewing the result",
        result: ready ? t.result : null,
        doctor_note: ready ? t.reviewNote : null,
        doctor_wants_to_talk: ready && t.abnormal === true,
      };
    }),
    referrals: referrals.map((r) => ({
      to: r.toDoctor ? doctorName(r.toDoctor) : (r.toFacility ?? "a specialist"),
      specialty: r.specialty,
      status:
        { CREATED: "being arranged", SCHEDULED: "appointment booked", ATTENDED: "waiting for the specialist's report", REPORT_RECEIVED: "the doctor is reviewing the report", CLOSED: "completed", CANCELLED: "cancelled" }[r.status],
      appointment: r.appointmentAt && r.status === "SCHEDULED" ? when(r.appointmentAt) : null,
      instructions: r.status !== "CLOSED" ? r.patientInstructions : null,
      outcome: r.status === "CLOSED" ? r.closureNote : null,
    })),
  };
}

/** Doctors on MiDokta matching a name or specialty (all of them when `query` is empty). */
export async function findDoctors(query: string) {
  const q = query.trim().replace(/^dr\.?\s+/i, "");
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  const doctors = await prisma.user.findMany({
    where: {
      role: Role.DOCTOR,
      isActive: true,
      ...(words.length
        ? { AND: words.map((w) => ({ OR: [{ firstName: { contains: w, mode: "insensitive" as const } }, { lastName: { contains: w, mode: "insensitive" as const } }, { specialty: { contains: w, mode: "insensitive" as const } }] })) }
        : {}),
    },
    orderBy: [{ firstName: "asc" }],
    take: 8,
    include: { hospital: { select: { name: true } } },
  });
  return doctors.map((d) => ({
    id: d.id,
    name: doctorName(d),
    specialty: d.specialty,
    hospital: d.hospital?.name ?? null,
    fee: feeOf(d) ? formatMoney(d.consultationFee!.toString()) : "free",
  }));
}

/** Medicines in stock at MiDokta pharmacies whose name matches, cheapest first. */
export async function findMedicines(query: string) {
  const words = query.trim().split(/\s+/).filter((w) => w.length > 2).slice(0, 4);
  if (!words.length) return [];
  const products = await prisma.pharmacyProduct.findMany({
    where: { isActive: true, quantity: { gt: 0 }, pharmacy: { isActive: true }, OR: words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) },
    orderBy: { price: "asc" },
    take: 8,
    include: { pharmacy: { select: { name: true, city: true } } },
  });
  return products.map((p) => ({
    id: p.id,
    name: [p.name, p.strength, p.form].filter(Boolean).join(" "),
    pharmacy: [p.pharmacy.name, p.pharmacy.city].filter(Boolean).join(", "),
    price: formatMoney(p.price.toString()),
    in_stock: p.quantity,
  }));
}

/** Doctors the patient can message: those they're allowed to chat with (their own doctors). */
export async function messageableDoctors(patient: User) {
  const doctors = await prisma.user.findMany({ where: { AND: [contactsWhere(patient), { role: Role.DOCTOR }] }, take: 20, orderBy: { firstName: "asc" } });
  return doctors.map((d) => ({ id: d.id, name: doctorName(d), specialty: d.specialty }));
}

// ---- Proposals -------------------------------------------------------------------------------------

export type ProposalInput =
  | { kind: "book"; doctor_id: string; date: string; time: string; visit_type: string; reason: string }
  | { kind: "cancel"; appointment_id: string }
  | { kind: "cart"; product_id: string; quantity: number }
  | { kind: "message"; doctor_id: string; message: string };

/** Checks an offer against the patient's data. Returns the offer to show, or why it can't be made. */
export async function buildProposal(patient: User, input: ProposalInput): Promise<{ proposal: OmegaProposal } | { error: string }> {
  switch (input.kind) {
    case "book": {
      const doctor = await prisma.user.findFirst({ where: { id: input.doctor_id, role: Role.DOCTOR, isActive: true } });
      if (!doctor) return { error: "No such doctor. Use find_doctors to get a doctor_id." };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time)) return { error: "Give the date as YYYY-MM-DD and the time as HH:MM (24-hour)." };
      const startsAt = new Date(`${input.date}T${input.time}`);
      if (isNaN(startsAt.getTime())) return { error: "That date or time doesn't exist." };
      if (startsAt.getTime() < Date.now() + 30 * 60_000) return { error: "That time has passed or is too soon. Ask the patient for a later time." };
      if (startsAt.getTime() > Date.now() + 180 * 86400_000) return { error: "Only times within the next 6 months can be booked." };
      const fee = feeOf(doctor);
      return {
        proposal: {
          kind: "book",
          doctorId: doctor.id,
          doctorName: doctorName(doctor),
          specialty: doctor.specialty,
          date: input.date,
          time: input.time,
          whenLabel: when(startsAt),
          visitType: input.visit_type === "VIDEO_CALL" ? "VIDEO_CALL" : "IN_PERSON",
          reason: (input.reason || "Consultation").slice(0, 120),
          fee: fee ? formatMoney(fee.toString()) : null,
          phone: patient.phone,
        },
      };
    }
    case "cancel": {
      const appt = (await upcomingAppointments(patient.id)).find((a) => a.id === input.appointment_id);
      if (!appt) return { error: "That isn't one of the patient's upcoming appointments. Use get_upcoming_appointments for the id." };
      return { proposal: { kind: "cancel", appointmentId: appt.id, label: appt.label, paid: appt.paid } };
    }
    case "cart": {
      const p = await prisma.pharmacyProduct.findFirst({ where: { id: input.product_id, isActive: true, pharmacy: { isActive: true } }, include: { pharmacy: true } });
      if (!p) return { error: "That product isn't available. Use find_medicines for a product_id." };
      const quantity = Math.max(1, Math.min(Math.floor(Number(input.quantity) || 1), 20, p.quantity));
      if (p.quantity < 1) return { error: "That product is sold out." };
      return {
        proposal: {
          kind: "cart",
          productId: p.id,
          name: [p.name, p.strength, p.form].filter(Boolean).join(" "),
          pharmacy: p.pharmacy.name,
          price: formatMoney(new Prisma.Decimal(p.price).times(quantity).toString()),
          quantity,
          prescriptionOnly: false,
        },
      };
    }
    case "message": {
      const doctor = (await messageableDoctors(patient)).find((d) => d.id === input.doctor_id);
      if (!doctor) return { error: "The patient can only message their own doctors. Use get_my_doctors for the doctor_id." };
      const text = input.message.trim().slice(0, 1000);
      if (!text) return { error: "Write the message first." };
      return { proposal: { kind: "message", doctorId: doctor.id, doctorName: doctor.name, text } };
    }
  }
}
