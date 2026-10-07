import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { videoConfigured } from "@/lib/calls";
import { myUpcomingAppointments } from "@/lib/patient-portal";
import AppointmentTable from "@/components/appointments/AppointmentTable";
import UpcomingList from "@/components/patient-portal/UpcomingList";
import RequestAppointmentButton from "@/components/patient-portal/RequestAppointmentButton";

export const dynamic = "force-dynamic";

export default async function PatientAppointmentsPage() {
  const patient = await requireUser(Role.PATIENT);

  const [upcoming, all, doctors] = await Promise.all([
    myUpcomingAppointments(patient.id),
    prisma.appointment.findMany({
      where: { patientId: patient.id },
      orderBy: { startsAt: "desc" },
      take: 60,
      include: { doctor: { select: { firstName: true, lastName: true } } },
    }),
    prisma.user.findMany({ where: { role: Role.DOCTOR, isActive: true }, orderBy: { firstName: "asc" } }),
  ]);
  const upcomingIds = new Set(upcoming.map((a) => a.id));

  return (
    <div className="settings">
      <div className="appt-header">
        <div>
          <h2 className="section-heading">Appointments</h2>
          <p className="section-sub">Request a visit, and see what&apos;s coming up.</p>
        </div>
        <RequestAppointmentButton
          doctors={doctors.map((d) => ({ id: d.id, name: `Dr. ${d.firstName} ${d.lastName}`, specialty: d.specialty }))}
        />
      </div>

      <UpcomingList appointments={upcoming} canCall={videoConfigured()} />

      <h2 className="section-heading detail-section-heading">Past and cancelled</h2>
      <AppointmentTable appointments={all.filter((a) => !upcomingIds.has(a.id))} />
    </div>
  );
}
