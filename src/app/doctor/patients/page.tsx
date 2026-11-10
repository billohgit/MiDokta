import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import Link from "next/link";
import Avatar from "@/components/appointments/Avatar";
import { formatDate, fullName } from "@/components/appointments/shared";
import { displayEmail } from "@/lib/people";
import { formatMoney } from "@/lib/money";
import { DEFAULT_COUNTRY } from "@/lib/sms/phone";
import InvitePatient, { type InviteRow } from "@/components/patients/InvitePatient";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string }> };

export default async function DoctorPatientsPage({ searchParams }: Props) {
  const doctor = await requireUser(Role.DOCTOR);
  const q = (await searchParams).q?.trim() ?? "";
  const now = new Date();

  const appointments = await prisma.appointment.findMany({
    where: {
      doctorId: doctor.id,
      status: { in: ["CONFIRMED", "COMPLETED"] },
      ...(q
        ? {
            patient: {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
              ],
            },
          }
        : {}),
    },
    orderBy: { startsAt: "asc" },
    include: {
      patient: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true, email: true, phone: true, gender: true },
      },
    },
  });

  // Group this doctor's appointments by patient.
  const byPatient = new Map<
    string,
    { patient: (typeof appointments)[number]["patient"]; visits: number; last: Date | null; next: Date | null }
  >();
  for (const a of appointments) {
    const row = byPatient.get(a.patientId) ?? { patient: a.patient, visits: 0, last: null, next: null };
    if (a.status === "COMPLETED" || a.startsAt < now) {
      row.visits++;
      row.last = a.startsAt;
    } else if (!row.next) {
      row.next = a.startsAt;
    }
    byPatient.set(a.patientId, row);
  }
  const rows = [...byPatient.values()].sort((a, b) => fullName(a.patient).localeCompare(fullName(b.patient)));

  // Visits this doctor booked for people not on MiDokta yet.
  const invites = await prisma.patientInvite.findMany({
    where: { doctorId: doctor.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { patient: { select: { firstName: true, lastName: true } } },
  });
  const paidInvoices = new Set(
    (await prisma.invoice.findMany({ where: { id: { in: invites.flatMap((i) => (i.invoiceId ? [i.invoiceId] : [])) }, status: "PAID" }, select: { id: true } })).map((i) => i.id),
  );
  const inviteRows: InviteRow[] = invites.map((i) => ({
    id: i.id,
    name: i.patient ? `${i.patient.firstName} ${i.patient.lastName}` : `${i.firstName} ${i.lastName}`,
    phone: i.phone,
    visit: `${formatDate(i.startsAt.toISOString())}`,
    status:
      i.status === "CANCELLED"
        ? "cancelled"
        : i.status === "ACCEPTED"
          ? i.invoiceId
            ? paidInvoices.has(i.invoiceId)
              ? "paid"
              : "registered"
            : "confirmed"
          : i.expiresAt < now
            ? "expired"
            : "waiting",
  }));

  return (
    <>
      <div className="appt-header">
        <h2 className="section-heading">My Patients</h2>
        <div className="appt-header-actions">
          <form role="search">
            <label className="search">
              <i className="fa-solid fa-magnifying-glass" />
              <input name="q" defaultValue={q} placeholder="Search patients..." />
            </label>
          </form>
        </div>
      </div>
      <div className="invite-bar">
        <InvitePatient
          invites={inviteRows}
          defaultCountry={DEFAULT_COUNTRY}
          fee={doctor.consultationFee?.isPositive() ? formatMoney(doctor.consultationFee.toString()) : null}
        />
      </div>

      {rows.length === 0 ? (
        <div className="empty-banner">{q ? "No patients match your search." : "No patients yet."}</div>
      ) : (
        <div className="card table-wrap">
          <table className="appt-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Past Visits</th>
                <th>Last Visit</th>
                <th>Next Appointment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ patient, visits, last, next }) => (
                <tr key={patient.id}>
                  <td>
                    <Link href={`/doctor/patients/${patient.id}`} className="person-cell">
                      <Avatar person={patient} size={36} />
                      <span>{fullName(patient)}</span>
                    </Link>
                  </td>
                  <td>{displayEmail(patient.email) ?? "—"}</td>
                  <td>{patient.phone ?? "—"}</td>
                  <td>{visits}</td>
                  <td>{last ? formatDate(last.toISOString()) : "—"}</td>
                  <td>{next ? formatDate(next.toISOString()) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
