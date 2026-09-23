import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { displayEmail } from "@/lib/people";
import { patientRecords } from "@/lib/records";
import { formatInvoiceNumber, formatMoney } from "@/lib/money";
import StatCard from "@/components/StatCard";
import PatientSummary from "./PatientSummary";
import PatientAdminActions from "./PatientAdminActions";
import MedicalHistory from "@/components/records/MedicalHistory";
import AppointmentTable from "@/components/appointments/AppointmentTable";
import { formatDate } from "@/components/appointments/shared";
import { INVOICE_STATUS_CLASS, INVOICE_STATUS_LABEL } from "@/components/billing/shared";

type Props = {
  id: string;
  basePath: string;
  /** Front-desk roles can edit, deactivate and invoice; clinical staff read the record. */
  canManage?: boolean;
  /** Deleting a patient is admin-only. */
  canDelete?: boolean;
};

/** One patient's full record, shared by the admin and staff portals. */
export default async function PatientDetailPage({ id, basePath, canManage = false, canDelete = false }: Props) {
  const patient = await prisma.user.findFirst({ where: { id, role: Role.PATIENT } });
  if (!patient) notFound();

  const [records, appointments, invoices] = await Promise.all([
    patientRecords(id),
    prisma.appointment.findMany({
      where: { patientId: id },
      orderBy: { startsAt: "desc" },
      include: { doctor: { select: { firstName: true, lastName: true } } },
    }),
    prisma.invoice.findMany({ where: { patientId: id }, orderBy: { createdAt: "desc" } }),
  ]);

  const now = new Date();
  const outstanding = invoices
    .filter((i) => i.status === "UNPAID" || i.status === "PARTIAL")
    .reduce((sum, i) => sum + Number(i.total) - Number(i.amountPaid), 0);

  return (
    <div className="settings">
      <Link href={`${basePath}/patients`} className="back-link">
        <i className="fa-solid fa-arrow-left" /> All patients
      </Link>

      <PatientSummary
        patient={patient}
        actions={
          canManage ? (
          <PatientAdminActions
            patient={{
              id: patient.id,
              firstName: patient.firstName,
              lastName: patient.lastName,
              email: displayEmail(patient.email),
              phone: patient.phone,
              smsOptIn: patient.smsOptIn,
              gender: patient.gender,
              dateOfBirth: patient.dateOfBirth?.toISOString().slice(0, 10) ?? null,
              bloodGroup: patient.bloodGroup,
              allergies: patient.allergies,
              chronicConditions: patient.chronicConditions,
              address: patient.address,
              city: patient.city,
              emergencyContactName: patient.emergencyContactName,
              emergencyContactPhone: patient.emergencyContactPhone,
              isActive: patient.isActive,
            }}
            basePath={basePath}
            canDelete={canDelete}
          />
          ) : null
        }
      />

      <section className="stats detail-stats">
        <StatCard label="Visits" value={appointments.filter((a) => a.status === "COMPLETED").length} icon="fa-stethoscope" />
        <StatCard
          label="Upcoming"
          value={appointments.filter((a) => a.status === "CONFIRMED" && a.startsAt >= now).length}
          icon="fa-calendar-check"
        />
        <StatCard label="Records" value={records.length} icon="fa-notes-medical" />
        <StatCard label="Outstanding" value={formatMoney(outstanding)} icon="fa-file-invoice-dollar" />
      </section>

      <h2 className="section-heading detail-section-heading">Medical History</h2>
      <MedicalHistory records={records} />

      <h2 className="section-heading detail-section-heading">Appointments</h2>
      <AppointmentTable appointments={appointments} />

      <h2 className="section-heading detail-section-heading">Invoices</h2>
      {invoices.length === 0 ? (
        <div className="empty-banner">No invoices yet.</div>
      ) : (
        <div className="card table-wrap">
          <table className="appt-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td>
                    {canManage ? (
                      <Link href={`${basePath}/billing/${i.id}`} className="table-link">
                        {formatInvoiceNumber(i.number)}
                      </Link>
                    ) : (
                      formatInvoiceNumber(i.number)
                    )}
                  </td>
                  <td>{formatDate(i.createdAt.toISOString())}</td>
                  <td>{formatMoney(i.total.toString())}</td>
                  <td>{formatMoney(i.amountPaid.toString())}</td>
                  <td>{i.status === "VOID" ? "—" : formatMoney(Number(i.total) - Number(i.amountPaid))}</td>
                  <td>
                    <span className={`status-pill ${INVOICE_STATUS_CLASS[i.status]}`}>{INVOICE_STATUS_LABEL[i.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
