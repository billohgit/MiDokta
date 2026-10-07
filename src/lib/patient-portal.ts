import "server-only";

import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** The doctors a patient has had (or has booked) appointments with: who they can message and call. */
export const myDoctors = (patientId: string) =>
  prisma.user.findMany({
    where: { role: Role.DOCTOR, isActive: true, doctorAppointments: { some: { patientId } } },
    orderBy: { firstName: "asc" },
  });

/** A patient's upcoming appointments and requests, soonest first (including ones that just started). */
export const myUpcomingAppointments = (patientId: string, take?: number) =>
  prisma.appointment.findMany({
    where: { patientId, startsAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, status: { in: ["PENDING", "CONFIRMED"] } },
    orderBy: { startsAt: "asc" },
    take,
    include: { doctor: true, hospital: { select: { name: true } } },
  });

export type UpcomingAppointment = Awaited<ReturnType<typeof myUpcomingAppointments>>[number];
