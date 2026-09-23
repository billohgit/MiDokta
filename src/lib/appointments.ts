import type { Appointment, Prisma } from "@prisma/client";
import type { AppointmentRow, Person } from "@/components/appointments/shared";
import { prisma } from "@/lib/prisma";

type WithPeople = Appointment & { patient: Person; doctor: Person | null };

export const toAppointmentRows = (appointments: WithPeople[]): AppointmentRow[] =>
  appointments.map((a) => ({
    id: a.id,
    title: a.title,
    startsAt: a.startsAt.toISOString(),
    status: a.status,
    visitType: a.visitType,
    patient: a.patient,
    doctor: a.doctor,
  }));

/** Next few confirmed/pending appointments matching `where`, shaped for <UpcomingEvents>. */
export async function upcomingEvents(where: Prisma.AppointmentWhereInput = {}, take = 5) {
  const upcoming = await prisma.appointment.findMany({
    where: { ...where, startsAt: { gte: new Date() }, status: { in: ["PENDING", "CONFIRMED"] } },
    orderBy: { startsAt: "asc" },
    take,
    include: { patient: { select: { firstName: true, lastName: true } } },
  });

  return upcoming.map((a) => ({
    id: a.id,
    title: a.title,
    startsAt: a.startsAt.toISOString(),
    patient: `${a.patient.firstName} ${a.patient.lastName}`,
  }));
}
