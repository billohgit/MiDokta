import "server-only";

import { prisma } from "@/lib/prisma";
import { courseEnd, doseSlots, type DoseSlot } from "@/lib/medication-schedule";

/** One medicine the patient is currently taking, and when in the day to take it. */
export type MedicationPlan = {
  id: string;
  medication: string;
  dosage: string;
  frequency: string;
  instructions: string | null;
  /** Empty when there are no fixed times (as needed, weekly, or unreadable). */
  slots: DoseSlot[];
  startedOn: string;
  /** When the course ends (ISO), or null for ongoing medicines. */
  endsOn: string | null;
  prescribedBy: string;
};

/** Courses that started more than this long ago are never shown, whatever their duration says. */
const LOOKBACK_DAYS = 400;

/** The patient's prescriptions whose course hasn't ended yet, from their doctors' visit notes. */
export async function activeMedications(patientId: string, now = new Date()): Promise<MedicationPlan[]> {
  const prescriptions = await prisma.prescription.findMany({
    where: {
      record: { patientId, createdAt: { gte: new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000) } },
    },
    orderBy: { record: { createdAt: "desc" } },
    include: { record: { select: { createdAt: true, doctor: { select: { firstName: true, lastName: true } } } } },
  });

  return prescriptions.flatMap((p) => {
    const start = p.dispensedAt ?? p.record.createdAt;
    const end = courseEnd(start, p.duration);
    if (end && end <= now) return [];
    return [
      {
        id: p.id,
        medication: p.medication,
        dosage: p.dosage,
        frequency: p.frequency,
        instructions: p.instructions,
        slots: doseSlots(p.frequency),
        startedOn: start.toISOString(),
        endsOn: end?.toISOString() ?? null,
        prescribedBy: `Dr. ${p.record.doctor.firstName} ${p.record.doctor.lastName}`,
      },
    ];
  });
}
