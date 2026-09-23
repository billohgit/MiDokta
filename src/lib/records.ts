import "server-only";

import { prisma } from "@/lib/prisma";

/** A patient's medical records, newest first, with doctor and prescriptions. */
export const patientRecords = (patientId: string, take?: number) =>
  prisma.medicalRecord.findMany({
    where: { patientId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      doctor: { select: { firstName: true, lastName: true, specialty: true } },
      prescriptions: true,
      appointment: { select: { title: true, startsAt: true } },
    },
  });

export type RecordWithDetails = Awaited<ReturnType<typeof patientRecords>>[number];
