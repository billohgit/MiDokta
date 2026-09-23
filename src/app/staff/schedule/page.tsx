import Link from "next/link";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { personSelect } from "@/lib/people";
import Avatar from "@/components/appointments/Avatar";
import { STATUS_LABEL, VISIT_LABEL, formatDate, formatTime, fullName } from "@/components/appointments/shared";

export const dynamic = "force-dynamic";

/** A local YYYY-MM-DD string, so the picker and the query agree on "today". */
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function NurseSchedulePage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  await requireUser(Role.NURSE);

  const { d } = await searchParams;
  const day = d && !isNaN(new Date(`${d}T00:00:00`).getTime()) ? new Date(`${d}T00:00:00`) : new Date();
  const from = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);

  const appointments = await prisma.appointment.findMany({
    where: { startsAt: { gte: from, lt: to }, status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] } },
    orderBy: { startsAt: "asc" },
    include: { patient: { select: { ...personSelect, allergies: true } }, doctor: { select: personSelect } },
  });

  return (
    <>
      <div className="appt-header">
        <div>
          <h2 className="section-heading">Schedule</h2>
          <p className="section-sub">
            {formatDate(from.toISOString())} · {appointments.length === 1 ? "1 appointment" : `${appointments.length} appointments`}
          </p>
        </div>
        <form className="appt-header-actions">
          <label className="field">
            <input type="date" name="d" defaultValue={isoDay(from)} />
          </label>
          <button type="submit" className="btn btn-primary btn-lg">
            Show
          </button>
        </form>
      </div>

      {appointments.length === 0 ? (
        <div className="empty-banner">Nothing scheduled for this day.</div>
      ) : (
        <div className="card table-wrap">
          <table className="appt-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Patient</th>
                <th>Allergies</th>
                <th>Reason</th>
                <th>Doctor</th>
                <th>Visit Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id}>
                  <td>{formatTime(a.startsAt.toISOString())}</td>
                  <td>
                    <Link href={`/staff/patients/${a.patient.id}`} className="person-cell">
                      <Avatar person={a.patient} size={36} />
                      <span>{fullName(a.patient)}</span>
                    </Link>
                  </td>
                  <td>{a.patient.allergies ? <span className="alert-pill">{a.patient.allergies}</span> : "—"}</td>
                  <td>{a.title}</td>
                  <td>{fullName(a.doctor) || "—"}</td>
                  <td>{VISIT_LABEL[a.visitType]}</td>
                  <td>
                    <span className={`status-pill status-${a.status.toLowerCase()}`}>{STATUS_LABEL[a.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
