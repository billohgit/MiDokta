import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { patientRecords } from "@/lib/records";
import PatientSummary from "@/components/patients/PatientSummary";
import MedicalHistory from "@/components/records/MedicalHistory";
import AppointmentTable from "@/components/appointments/AppointmentTable";
import CallButton from "@/components/calls/CallButton";
import { videoConfigured } from "@/lib/calls";
import PatientFollowUps from "@/components/followups/PatientFollowUps";
import NewFollowUpButtons from "@/components/followups/NewFollowUpButtons";

export const dynamic = "force-dynamic";

export default async function DoctorPatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const doctor = await requireUser(Role.DOCTOR);
  const { id } = await params;

  // Doctors can only open patients they have (or had) an appointment with.
  const [patient, sharedAppointments] = await Promise.all([
    prisma.user.findFirst({ where: { id, role: Role.PATIENT } }),
    prisma.appointment.count({ where: { patientId: id, doctorId: doctor.id } }),
  ]);
  if (!patient || sharedAppointments === 0) notFound();

  const [records, appointments, doctors, navigators] = await Promise.all([
    patientRecords(id),
    prisma.appointment.findMany({
      where: { patientId: id, doctorId: doctor.id },
      orderBy: { startsAt: "desc" },
      include: { doctor: { select: { firstName: true, lastName: true } } },
    }),
    prisma.user.findMany({ where: { role: Role.DOCTOR, isActive: true, id: { not: doctor.id } }, orderBy: { firstName: "asc" } }),
    prisma.user.findMany({ where: { role: { in: [Role.NURSE, Role.RECEPTIONIST] }, isActive: true }, orderBy: { firstName: "asc" } }),
  ]);

  return (
    <div className="settings">
      <Link href="/doctor/patients" className="back-link">
        <i className="fa-solid fa-arrow-left" /> My patients
      </Link>

      <PatientSummary
        patient={patient}
        actions={
          videoConfigured() &&
          patient.isActive && <CallButton calleeId={patient.id} name={`${patient.firstName} ${patient.lastName}`} basePath="/doctor" />
        }
      />

      <h2 className="section-heading detail-section-heading">Medical History</h2>
      <MedicalHistory records={records} />

      <PatientFollowUps
        patientId={patient.id}
        basePath="/doctor"
        testWhere={{ orderedById: doctor.id }}
        referralWhere={{ OR: [{ referredById: doctor.id }, { toDoctorId: doctor.id }] }}
        actions={
          <NewFollowUpButtons
            patientId={patient.id}
            doctors={doctors.map((d) => ({ id: d.id, name: `Dr. ${d.firstName} ${d.lastName}`, detail: d.specialty }))}
            navigators={navigators.map((n) => ({ id: n.id, name: `${n.firstName} ${n.lastName}`, detail: n.role.toLowerCase() }))}
          />
        }
      />

      <h2 className="section-heading detail-section-heading">Appointments with you</h2>
      <AppointmentTable appointments={appointments} linkBase="/doctor/appointments" />
    </div>
  );
}
