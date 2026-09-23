import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { patientRecords } from "@/lib/records";
import PatientSummary from "@/components/patients/PatientSummary";
import MedicalHistory from "@/components/records/MedicalHistory";
import AppointmentTable from "@/components/appointments/AppointmentTable";

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

  const [records, appointments] = await Promise.all([
    patientRecords(id),
    prisma.appointment.findMany({
      where: { patientId: id, doctorId: doctor.id },
      orderBy: { startsAt: "desc" },
      include: { doctor: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  return (
    <div className="settings">
      <Link href="/doctor/patients" className="back-link">
        <i className="fa-solid fa-arrow-left" /> My patients
      </Link>

      <PatientSummary patient={patient} />

      <h2 className="section-heading detail-section-heading">Medical History</h2>
      <MedicalHistory records={records} />

      <h2 className="section-heading detail-section-heading">Appointments with you</h2>
      <AppointmentTable appointments={appointments} linkBase="/doctor/appointments" />
    </div>
  );
}
