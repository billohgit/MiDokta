import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { personSelect } from "@/lib/people";
import { toAppointmentRows } from "@/lib/appointments";
import AppointmentsView from "@/components/appointments/AppointmentsView";

export const dynamic = "force-dynamic";

export default async function DoctorAppointmentsPage() {
  const doctor = await requireUser(Role.DOCTOR);

  const [appointments, patients] = await Promise.all([
    prisma.appointment.findMany({
      // Own appointments, plus unassigned requests any doctor can accept.
      where: { OR: [{ doctorId: doctor.id }, { doctorId: null, status: "PENDING" }] },
      orderBy: { startsAt: "asc" },
      include: { patient: { select: personSelect }, doctor: { select: personSelect } },
    }),
    prisma.user.findMany({ where: { role: Role.PATIENT, isActive: true }, select: personSelect, orderBy: { firstName: "asc" } }),
  ]);

  return (
    <AppointmentsView
      appointments={toAppointmentRows(appointments)}
      patients={patients}
      doctors={[]}
      currentDoctorId={doctor.id}
      basePath="/doctor"
    />
  );
}
