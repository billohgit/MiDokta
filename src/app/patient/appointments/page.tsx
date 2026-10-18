import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { videoConfigured } from "@/lib/calls";
import { myUpcomingAppointments } from "@/lib/patient-portal";
import { ratableVisits } from "@/lib/ratings";
import AppointmentTable from "@/components/appointments/AppointmentTable";
import UpcomingList from "@/components/patient-portal/UpcomingList";
import RequestAppointmentButton from "@/components/patient-portal/RequestAppointmentButton";
import VisitRatingList from "@/components/ratings/VisitRatingList";

export const dynamic = "force-dynamic";

export default async function PatientAppointmentsPage() {
  const patient = await requireUser(Role.PATIENT);

  const [upcoming, all, doctors, visits] = await Promise.all([
    myUpcomingAppointments(patient.id),
    prisma.appointment.findMany({
      where: { patientId: patient.id },
      orderBy: { startsAt: "desc" },
      take: 60,
      include: { doctor: { select: { firstName: true, lastName: true } } },
    }),
    prisma.user.findMany({ where: { role: Role.DOCTOR, isActive: true }, orderBy: { firstName: "asc" } }),
    ratableVisits(patient.id, 10),
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

      {visits.length > 0 && (
        <>
          <h2 className="section-heading detail-section-heading">Rate your visits</h2>
          <p className="section-sub">How was the consultation, and how did the doctor treat you? Your feedback helps the clinic improve.</p>
          <VisitRatingList visits={visits} />
        </>
      )}

      <h2 className="section-heading detail-section-heading">Past and cancelled</h2>
      <AppointmentTable appointments={all.filter((a) => !upcomingIds.has(a.id))} />
    </div>
  );
}
