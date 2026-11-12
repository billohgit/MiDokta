"use client";

import Link from "next/link";
import { useState } from "react";
import { screenForPatient } from "@/app/actions/malaria";
import Modal from "@/components/ui/Modal";
import useServerAction from "@/components/ui/useServerAction";
import { DANGER_SIGNS, FOR_WHOM, SL_DISTRICTS, SUSPECT_THRESHOLD, SYMPTOMS } from "@/lib/malaria/screening";

type Patient = { id: string; name: string; phone: string | null; district: string | null };
type Result = { id?: string; outcome?: string; score?: number };

/** A health worker runs the same malaria check as Omega, for a patient in front of them or on the phone. */
export default function ScreenPatientButton({ basePath, patients }: { basePath: string; patients: Patient[] }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [patientId, setPatientId] = useState("");
  const { busy, error, setError, submitWith } = useServerAction();
  const close = () => {
    setOpen(false);
    setResult(null);
    setError(null);
  };
  const district = patients.find((p) => p.id === patientId)?.district ?? "";

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <i className="fa-solid fa-mosquito btn-icon" /> Check a patient
      </button>
      {open && (
        <Modal title="Malaria check" onClose={close} wide>
          {result ? (
            <>
              <p className="form-note">
                {result.outcome === "LOW"
                  ? `Malaria unlikely (${result.score}%, under ${SUSPECT_THRESHOLD}%). No case opened; the check is saved.`
                  : result.outcome === "DANGER"
                    ? `Danger signs: an emergency case is open and the patient has been told to go to hospital now.`
                    : `Malaria suspected (${result.score}%). A case is open and the patient has been referred for a test.`}
              </p>
              <div className="modal-actions">
                {result.id && (
                  <Link href={`${basePath}/malaria/${result.id}`} className="btn btn-primary" onClick={close}>
                    Open the case
                  </Link>
                )}
                <button className="btn btn-outline" onClick={close}>
                  Done
                </button>
              </div>
            </>
          ) : (
            <form className="form-grid" onSubmit={submitWith(screenForPatient, { onSuccess: (r) => setResult(r as Result) })}>
              <label className="field full">
                <span>Patient *</span>
                <select name="patientId" required value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                  <option value="">Choose the patient</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.phone ? ` · ${p.phone}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Who is unwell</span>
                <select name="forWhom" defaultValue="SELF">
                  {FOR_WHOM.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.id === "SELF" ? "The patient" : f.id === "CHILD" ? "Their child under 5" : "The patient, who is pregnant"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>District</span>
                <select name="district" key={district} defaultValue={(SL_DISTRICTS as readonly string[]).includes(district) ? district : ""}>
                  <option value="">Not given</option>
                  {SL_DISTRICTS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <fieldset className="full malaria-fieldset">
                <legend>Symptoms (tick each one they have)</legend>
                {SYMPTOMS.map((q) => (
                  <label key={q.id} className="checkbox-line">
                    <input type="checkbox" name={`s_${q.id}`} />
                    <span>
                      {q.text} <small className="section-sub">({q.weight}%)</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <fieldset className="full malaria-fieldset danger">
                <legend>Danger signs of severe malaria</legend>
                {DANGER_SIGNS.map((d) => (
                  <label key={d.id} className="checkbox-line">
                    <input type="checkbox" name={`d_${d.id}`} />
                    <span>{d.label}</span>
                  </label>
                ))}
              </fieldset>
              {error && <p className="form-error full">{error}</p>}
              <div className="modal-actions full">
                <button type="button" className="btn btn-outline" onClick={close}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? "Checking..." : "Score and refer"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
