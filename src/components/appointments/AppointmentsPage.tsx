import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { personSelect } from "@/lib/people";
import { toAppointmentRows } from "@/lib/appointments";
import AppointmentsView from "./AppointmentsView";

/** Clinic-wide appointments, shared by the admin and receptionist portals. */
export default async function AppointmentsPage({ basePath }: { basePath: string }) {
  const [appointments, patients, doctors] = await Promise.all([
    prisma.appointment.findMany({
      orderBy: { startsAt: "asc" },
      include: { patient: { select: personSelect }, doctor: { select: personSelect } },
    }),
    prisma.user.findMany({ where: { role: Role.PATIENT, isActive: true }, select: personSelect, orderBy: { firstName: "asc" } }),
    prisma.user.findMany({
      where: { role: Role.DOCTOR, isActive: true },
      select: personSelect,
      orderBy: { firstName: "asc" },
    }),
  ]);

  return (
    <AppointmentsView
      appointments={toAppointmentRows(appointments)}
      patients={patients}
      doctors={doctors}
      basePath={basePath}
    />
  );
}
