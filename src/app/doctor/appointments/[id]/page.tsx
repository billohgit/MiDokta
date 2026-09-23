import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { patientRecords } from "@/lib/records";
import PatientSummary from "@/components/patients/PatientSummary";
import MedicalHistory from "@/components/records/MedicalHistory";
import ConsultationForm, { type RecordFormData } from "@/components/records/ConsultationForm";
import AppointmentStatusButtons from "@/components/appointments/AppointmentStatusButtons";
import { STATUS_LABEL, VISIT_LABEL, formatDate, formatTime } from "@/components/appointments/shared";

export const dynamic = "force-dynamic";

export default async function ConsultationPage({ params }: { params: Promise<{ id: string }> }) {
  const doctor = await requireUser(Role.DOCTOR);
  const { id } = await params;

  const appt = await prisma.appointment.findUnique({
    where: { id },
    include: { patient: true, record: { include: { prescriptions: true } }, hospital: { select: { name: true } } },
  });
  // Own appointments, or unassigned requests the doctor may accept.
  const isOpenRequest = appt?.doctorId === null && appt.status === "PENDING";
  if (!appt || (appt.doctorId !== doctor.id && !isOpenRequest)) notFound();

  const history = (await patientRecords(appt.patientId, 6)).filter((r) => r.appointmentId !== appt.id).slice(0, 5);

  const record: RecordFormData | null = appt.record && {
    chiefComplaint: appt.record.chiefComplaint,
    diagnosis: appt.record.diagnosis,
    notes: appt.record.notes,
    temperature: appt.record.temperature?.toString() ?? null,
    bloodPressure: appt.record.bloodPressure,
    heartRate: appt.record.heartRate,
    respiratoryRate: appt.record.respiratoryRate,
    oxygenSaturation: appt.record.oxygenSaturation,
    weight: appt.record.weight?.toString() ?? null,
    height: appt.record.height?.toString() ?? null,
    followUpDate: appt.record.followUpDate?.toISOString().slice(0, 10) ?? null,
    prescriptions: appt.record.prescriptions.map((p) => ({
      medication: p.medication,
      dosage: p.dosage,
      frequency: p.frequency,
      duration: p.duration,
      instructions: p.instructions ?? "",
    })),
  };

  const canWrite = appt.doctorId === doctor.id && (appt.status === "CONFIRMED" || appt.status === "COMPLETED");

  return (
    <div className="settings">
      <Link href="/doctor/appointments" className="back-link">
        <i className="fa-solid fa-arrow-left" /> Appointments
      </Link>

      <section className="card consult-head">
        <div>
          <p className="section-sub">Consultation</p>
          <h2 className="section-heading">{appt.title}</h2>
          <p className="consult-meta">
            <span>
              <i className="fa-regular fa-calendar" /> {formatDate(appt.startsAt.toISOString())}
            </span>
            <span>
              <i className="fa-regular fa-clock" /> {formatTime(appt.startsAt.toISOString())}
            </span>
            <span>
              <i className={`fa-solid ${appt.visitType === "VIDEO_CALL" ? "fa-video" : "fa-person"}`} /> {VISIT_LABEL[appt.visitType]}
            </span>
            {appt.hospital && (
              <span>
                <i className="fa-solid fa-hospital" /> {appt.hospital.name}
              </span>
            )}
          </p>
        </div>
        <div className="consult-status">
          <span className={`status-pill status-${appt.status.toLowerCase()}`}>{STATUS_LABEL[appt.status]}</span>
          <AppointmentStatusButtons id={appt.id} status={appt.status} assignedToMe={appt.doctorId === doctor.id} />
        </div>
      </section>

      <PatientSummary
        patient={appt.patient}
        compact
        actions={
          appt.doctorId === doctor.id && (
            <Link href={`/doctor/patients/${appt.patientId}`} className="btn btn-outline btn-sm">
              Full history
            </Link>
          )
        }
      />

      {canWrite ? (
        <ConsultationForm appointmentId={appt.id} record={record} completed={appt.status === "COMPLETED"} />
      ) : (
        <div className="empty-banner">
          {appt.status === "PENDING"
            ? "Accept this request to start the consultation."
            : `This appointment was ${STATUS_LABEL[appt.status].toLowerCase()}.`}
        </div>
      )}

      <h2 className="section-heading detail-section-heading">Previous Visits</h2>
      <MedicalHistory records={history} emptyText="No previous records for this patient." />
    </div>
  );
}
