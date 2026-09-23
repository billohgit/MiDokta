"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deletePatient, setPatientActive } from "@/app/actions/patients";
import useServerAction from "@/components/ui/useServerAction";
import PatientFormModal from "./PatientFormModal";
import type { PatientFormData } from "./types";

type Props = {
  patient: PatientFormData & { isActive: boolean };
  /** The portal these links belong to, e.g. "/admin". */
  basePath: string;
  /** Deleting a patient is admin-only; receptionists deactivate instead. */
  canDelete?: boolean;
};

export default function PatientAdminActions({ patient, basePath, canDelete = false }: Props) {
  const [editing, setEditing] = useState(false);
  const { busy, error, run } = useServerAction();
  const router = useRouter();
  const name = `${patient.firstName} ${patient.lastName}`;

  return (
    <div className="doctor-detail-actions">
      <div className="doctor-actions">
        <button className="btn btn-primary btn-sm" onClick={() => setEditing(true)} disabled={busy}>
          <i className="fa-solid fa-pen btn-icon" /> Edit
        </button>
        <Link href={`${basePath}/billing/new?patient=${patient.id}`} className="btn btn-outline btn-sm">
          <i className="fa-solid fa-file-invoice btn-icon" /> New Invoice
        </Link>
        <button
          className="btn btn-outline btn-sm"
          disabled={busy}
          onClick={() =>
            run(() => setPatientActive(patient.id, !patient.isActive), {
              confirm: patient.isActive ? `Deactivate ${name}?` : undefined,
            })
          }
        >
          {patient.isActive ? "Deactivate" : "Activate"}
        </button>
        {canDelete && (
          <button
            className="btn btn-outline btn-sm danger-text"
            disabled={busy}
            onClick={() =>
              run(() => deletePatient(patient.id), {
                confirm: `Delete ${name}? This cannot be undone.`,
                onSuccess: () => router.push(`${basePath}/patients`),
              })
            }
          >
            Delete
          </button>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
      {editing && <PatientFormModal patient={patient} onClose={() => setEditing(false)} />}
    </div>
  );
}
