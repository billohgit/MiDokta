"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/appointments/Avatar";
import DoctorFormModal from "./DoctorFormModal";
import useDoctorActions from "./useDoctorActions";
import type { DoctorRow, Hospital } from "./types";

type Props = { doctors: DoctorRow[]; hospitals: Hospital[] };

export default function DoctorsView({ doctors, hospitals }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [editing, setEditing] = useState<DoctorRow | "new" | null>(null);
  const { busy, error, toggleActive, remove } = useDoctorActions();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return doctors.filter((d) => {
      if (status === "active" && !d.isActive) return false;
      if (status === "inactive" && d.isActive) return false;
      if (!q) return true;
      return [d.firstName, d.lastName, d.email, d.specialty ?? "", d.hospital?.name ?? ""].some((s) =>
        s.toLowerCase().includes(q)
      );
    });
  }, [doctors, query, status]);

  const activeCount = doctors.filter((d) => d.isActive).length;

  return (
    <div className={busy ? "is-busy" : undefined}>
      <div className="appt-header">
        <div>
          <h2 className="section-heading">Doctors</h2>
          <p className="section-sub">
            {doctors.length} total · {activeCount} active
          </p>
        </div>
        <div className="appt-header-actions">
          <label className="search">
            <i className="fa-solid fa-magnifying-glass" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search doctors..." />
          </label>
          <button className="btn btn-primary btn-lg" onClick={() => setEditing("new")}>
            <i className="fa-solid fa-plus btn-icon" /> Add Doctor
          </button>
        </div>
      </div>

      <div className="all-header">
        <div className="segmented" role="tablist">
          {(["all", "active", "inactive"] as const).map((s) => (
            <button key={s} role="tab" aria-selected={status === s} className={status === s ? "on" : ""} onClick={() => setStatus(s)}>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="form-error page-error">{error}</p>}

      {visible.length === 0 ? (
        <div className="empty-banner">No doctors found.</div>
      ) : (
        <div className="doctor-grid">
          {visible.map((d) => (
            <article key={d.id} className={`card doctor-card${d.isActive ? "" : " inactive"}`}>
              <span className={`status-pill ${d.isActive ? "status-confirmed" : "status-cancelled"} doctor-status`}>
                {d.isActive ? "Active" : "Inactive"}
              </span>
              <Avatar person={d} size={96} online={d.isActive} />
              <h3 className="doctor-name">
                Dr. {d.firstName} {d.lastName}
              </h3>
              <p className="doctor-specialty">{d.specialty ?? "General Practice"}</p>
              <p className="doctor-meta">
                <i className="fa-solid fa-hospital" /> {d.hospital?.name ?? "No hospital assigned"}
              </p>
              {d.experienceYears !== null && (
                <p className="doctor-meta">
                  <i className="fa-solid fa-briefcase-medical" /> {d.experienceYears} yrs experience
                </p>
              )}

              <div className="doctor-stats">
                <div>
                  <strong>{d.totalAppointments}</strong>
                  <span>Appointments</span>
                </div>
                <div>
                  <strong>{d.upcomingAppointments}</strong>
                  <span>Upcoming</span>
                </div>
              </div>

              <div className="doctor-actions">
                <Link href={`/admin/doctors/${d.id}`} className="btn btn-primary btn-sm">
                  View
                </Link>
                <button className="btn btn-outline btn-sm" onClick={() => setEditing(d)} disabled={busy}>
                  Edit
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => toggleActive(d)} disabled={busy}>
                  {d.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  className="icon-btn danger"
                  onClick={() => remove(d)}
                  disabled={busy}
                  aria-label={`Delete Dr. ${d.firstName} ${d.lastName}`}
                  title="Delete"
                >
                  <i className="fa-solid fa-trash" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <DoctorFormModal
          doctor={editing === "new" ? null : editing}
          hospitals={hospitals}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
