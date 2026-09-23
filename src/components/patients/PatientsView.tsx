"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Avatar from "@/components/appointments/Avatar";
import { formatDate } from "@/components/appointments/shared";
import PatientFormModal from "./PatientFormModal";
import type { PatientRow } from "./types";

const GENDER_SHORT = { MALE: "M", FEMALE: "F", OTHER: "O" } as const;

type Props = {
  patients: PatientRow[];
  /** The portal these links belong to, e.g. "/admin". */
  basePath: string;
  /** Front-desk roles can register new patients; everyone else reads the list. */
  canRegister?: boolean;
};

export default function PatientsView({ patients, basePath, canRegister = false }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return patients.filter(
      (p) =>
        (status === "all" || p.isActive === (status === "active")) &&
        (!q ||
          [`${p.firstName} ${p.lastName}`, p.email ?? "", p.phone ?? "", p.bloodGroup ?? ""].some((v) =>
            v.toLowerCase().includes(q)
          ))
    );
  }, [patients, query, status]);

  return (
    <div>
      <div className="appt-header">
        <div>
          <h2 className="section-heading">Patients</h2>
          <p className="section-sub">
            {patients.length} registered · {patients.filter((p) => p.nextAppointment).length} with upcoming appointments
          </p>
        </div>
        <div className="appt-header-actions">
          <label className="search">
            <i className="fa-solid fa-magnifying-glass" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, phone, email..." />
          </label>
          {canRegister && (
            <button className="btn btn-primary btn-lg" onClick={() => setCreating(true)}>
              <i className="fa-solid fa-plus btn-icon" /> Register Patient
            </button>
          )}
        </div>
      </div>

      <div className="all-header">
        <div className="segmented" role="tablist">
          {(["active", "inactive", "all"] as const).map((s) => (
            <button key={s} role="tab" aria-selected={status === s} className={status === s ? "on" : ""} onClick={() => setStatus(s)}>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty-banner">No patients found.</div>
      ) : (
        <div className="card table-wrap">
          <table className="appt-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Age / Sex</th>
                <th>Phone</th>
                <th>Blood</th>
                <th>Allergies</th>
                <th>Last Visit</th>
                <th>Next Appointment</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id} className={p.isActive ? undefined : "row-inactive"}>
                  <td>
                    <Link href={`${basePath}/patients/${p.id}`} className="person-cell">
                      <Avatar person={p} size={36} />
                      <span>
                        {p.firstName} {p.lastName}
                        {!p.isActive && <em className="you-tag"> (inactive)</em>}
                      </span>
                    </Link>
                  </td>
                  <td>
                    {p.age ?? "—"} / {p.gender ? GENDER_SHORT[p.gender] : "—"}
                  </td>
                  <td>{p.phone ?? "—"}</td>
                  <td>{p.bloodGroup ?? "—"}</td>
                  <td>{p.allergies ? <span className="alert-pill">{p.allergies}</span> : "—"}</td>
                  <td>{p.lastVisit ? formatDate(p.lastVisit) : "—"}</td>
                  <td>{p.nextAppointment ? formatDate(p.nextAppointment) : "—"}</td>
                  <td className="row-actions">
                    <Link href={`${basePath}/patients/${p.id}`} className="btn btn-sm btn-outline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <PatientFormModal patient={null} onClose={() => setCreating(false)} onSaved={(id) => router.push(`${basePath}/patients/${id}`)} />
      )}
    </div>
  );
}
