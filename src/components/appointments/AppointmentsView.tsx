"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { AppointmentStatus } from "@prisma/client";
import { setAppointmentStatus } from "@/app/actions/appointments";
import Avatar from "./Avatar";
import RequestsCarousel from "./RequestsCarousel";
import ScheduleModal from "./ScheduleModal";
import { type AppointmentRow, type Person, STATUS_LABEL, VISIT_LABEL, formatDate, formatTime, fullName } from "./shared";

type Props = {
  appointments: AppointmentRow[];
  patients: Person[];
  /** Admin view: doctors to choose from when scheduling. */
  doctors: Person[];
  /** Doctor view: the signed-in doctor. Scheduling assigns to them and they can only reject their own requests. */
  currentDoctorId?: string;
  /** The portal these links belong to, e.g. "/admin". */
  basePath: string;
};

export default function AppointmentsView({ appointments, patients, doctors, currentDoctorId, basePath }: Props) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | AppointmentStatus>("ALL");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return appointments;
    return appointments.filter((a) =>
      [fullName(a.patient), fullName(a.doctor), a.title].some((s) => s.toLowerCase().includes(q))
    );
  }, [appointments, query]);

  const requests = matches.filter((a) => a.status === "PENDING");
  const processed = matches.filter(
    (a) => a.status !== "PENDING" && (statusFilter === "ALL" || a.status === statusFilter)
  );

  const updateStatus = (id: string, status: AppointmentStatus) =>
    startTransition(async () => {
      const result = await setAppointmentStatus(id, status);
      setError(result.ok ? null : result.error);
    });

  return (
    <div className={pending ? "is-busy" : undefined}>
      <div className="appt-header">
        <h2 className="section-heading">Appointments</h2>
        <div className="appt-header-actions">
          <label className="search">
            <i className="fa-solid fa-magnifying-glass" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type here..." />
          </label>
          <button className="btn btn-primary btn-lg" onClick={() => setScheduleOpen(true)}>
            Schedule Appointment
          </button>
        </div>
      </div>

      {error && <p className="form-error page-error">{error}</p>}

      <section className="requests-panel">
        <h3 className="requests-title">Recent Requests</h3>
        <RequestsCarousel
          requests={requests}
          disabled={pending}
          onAccept={(id) => updateStatus(id, "CONFIRMED")}
          onReject={(id) => updateStatus(id, "REJECTED")}
          canReject={(r) => !currentDoctorId || r.doctor?.id === currentDoctorId}
        />
      </section>

      <div className="all-header">
        <h2 className="section-heading">All Appointments</h2>
        <label className="status-filter">
          <span>Status:</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="ALL">All statuses</option>
            {(["CONFIRMED", "COMPLETED", "REJECTED", "CANCELLED"] as const).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {processed.length === 0 ? (
        <div className="empty-banner">No appointments found.</div>
      ) : (
        <div className="card table-wrap">
          <table className="appt-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Doctor</th>
                <th>Date</th>
                <th>Time</th>
                <th>Visit Type</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {processed.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`${basePath}/patients/${a.patient.id}`} className="person-cell">
                      <Avatar person={a.patient} size={36} />
                      <span>{fullName(a.patient)}</span>
                    </Link>
                  </td>
                  <td>{fullName(a.doctor) || "—"}</td>
                  <td>{formatDate(a.startsAt)}</td>
                  <td>{formatTime(a.startsAt)}</td>
                  <td>{VISIT_LABEL[a.visitType]}</td>
                  <td>
                    <span className={`status-pill status-${a.status.toLowerCase()}`}>{STATUS_LABEL[a.status]}</span>
                  </td>
                  <td className="row-actions">
                    {currentDoctorId && (a.status === "CONFIRMED" || a.status === "COMPLETED") && (
                      <Link href={`/doctor/appointments/${a.id}`} className="btn btn-sm btn-primary">
                        {a.status === "CONFIRMED" ? "Consult" : "View Record"}
                      </Link>
                    )}
                    {!currentDoctorId && a.status === "CONFIRMED" && (
                      <button
                        className="btn btn-sm btn-success"
                        disabled={pending}
                        onClick={() => updateStatus(a.id, "COMPLETED")}
                      >
                        Complete
                      </button>
                    )}
                    {!currentDoctorId && (a.status === "CONFIRMED" || a.status === "COMPLETED") && (
                      <Link href={`${basePath}/billing/new?appointment=${a.id}`} className="btn btn-sm btn-outline">
                        Invoice
                      </Link>
                    )}
                    {a.status === "CONFIRMED" && (
                      <button
                        className="btn btn-sm btn-outline"
                        disabled={pending}
                        onClick={() => confirm("Cancel this appointment?") && updateStatus(a.id, "CANCELLED")}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {scheduleOpen && (
        <ScheduleModal patients={patients} doctors={currentDoctorId ? null : doctors} onClose={() => setScheduleOpen(false)} />
      )}
    </div>
  );
}
