"use client";

import { useState } from "react";
import DoctorFormModal from "./DoctorFormModal";
import useDoctorActions from "./useDoctorActions";
import type { DoctorRow, Hospital } from "./types";

export default function DoctorDetailActions({ doctor, hospitals }: { doctor: DoctorRow; hospitals: Hospital[] }) {
  const [editing, setEditing] = useState(false);
  const { busy, error, toggleActive, remove } = useDoctorActions();

  return (
    <div className="doctor-detail-actions">
      <div className="doctor-actions">
        <button className="btn btn-primary btn-sm" onClick={() => setEditing(true)} disabled={busy}>
          <i className="fa-solid fa-pen btn-icon" /> Edit
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => toggleActive(doctor)} disabled={busy}>
          {doctor.isActive ? "Deactivate" : "Activate"}
        </button>
        <button className="btn btn-outline btn-sm danger-text" onClick={() => remove(doctor, "/admin/doctors")} disabled={busy}>
          Delete
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {editing && <DoctorFormModal doctor={doctor} hospitals={hospitals} onClose={() => setEditing(false)} />}
    </div>
  );
}
