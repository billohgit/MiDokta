import Link from "next/link";
import type { Appointment } from "@prisma/client";
import { STATUS_LABEL, VISIT_LABEL, formatDate, formatTime } from "./shared";

type Row = Appointment & { doctor: { firstName: string; lastName: string } | null };

type Props = { appointments: Row[]; linkBase?: string };

/** Read-only appointment history table. Server component. */
export default function AppointmentTable({ appointments, linkBase }: Props) {
  if (appointments.length === 0) return <div className="empty-banner">No appointments found.</div>;

  return (
    <div className="card table-wrap">
      <table className="appt-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            <th>Reason</th>
            <th>Doctor</th>
            <th>Visit Type</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((a) => (
            <tr key={a.id}>
              <td>{formatDate(a.startsAt.toISOString())}</td>
              <td>{formatTime(a.startsAt.toISOString())}</td>
              <td>{linkBase ? <Link href={`${linkBase}/${a.id}`} className="table-link">{a.title}</Link> : a.title}</td>
              <td>{a.doctor ? `Dr. ${a.doctor.firstName} ${a.doctor.lastName}` : "Unassigned"}</td>
              <td>{VISIT_LABEL[a.visitType]}</td>
              <td>
                <span className={`status-pill status-${a.status.toLowerCase()}`}>{STATUS_LABEL[a.status]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
