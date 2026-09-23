"use client";

import { useRef, useState } from "react";
import { saveMedicalRecord } from "@/app/actions/records";
import useServerAction from "@/components/ui/useServerAction";

type Rx = { medication: string; dosage: string; frequency: string; duration: string; instructions: string };

export type RecordFormData = {
  chiefComplaint: string | null;
  diagnosis: string;
  notes: string | null;
  temperature: string | null;
  bloodPressure: string | null;
  heartRate: number | null;
  respiratoryRate: number | null;
  oxygenSaturation: number | null;
  weight: string | null;
  height: string | null;
  followUpDate: string | null;
  prescriptions: Rx[];
};

const EMPTY_RX: Rx = { medication: "", dosage: "", frequency: "", duration: "", instructions: "" };

type Props = { appointmentId: string; record: RecordFormData | null; completed: boolean };

export default function ConsultationForm({ appointmentId, record, completed }: Props) {
  // Each row gets a stable key so inputs keep their values when rows are removed.
  const nextKey = useRef(0);
  const withKey = (rx: Rx) => ({ ...rx, key: nextKey.current++ });
  const [rows, setRows] = useState(() => (record?.prescriptions.length ? record.prescriptions : [EMPTY_RX]).map(withKey));
  const [saved, setSaved] = useState<string | null>(null);
  const { busy, error, submitWith } = useServerAction();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    setSaved(null);
    const completing = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "1";
    submitWith(saveMedicalRecord, {
      onSuccess: () => setSaved(completing ? "Saved and marked as completed." : "Record saved."),
    })(e);
  };

  const v = (n: number | string | null | undefined) => (n === null || n === undefined ? "" : String(n));

  return (
    <form onSubmit={submit} className="card consult-form">
      <input type="hidden" name="appointmentId" value={appointmentId} />

      <div className="details-head">
        <h3>Consultation Notes</h3>
        {record && <span className="section-sub">Last saved record loaded</span>}
      </div>

      <p className="form-section">Vitals</p>
      <div className="vitals-grid">
        <label className="field">
          <span>Temperature (°C)</span>
          <input name="temperature" inputMode="decimal" defaultValue={v(record?.temperature)} placeholder="36.8" />
        </label>
        <label className="field">
          <span>Blood Pressure</span>
          <input name="bloodPressure" defaultValue={v(record?.bloodPressure)} placeholder="120/80" />
        </label>
        <label className="field">
          <span>Heart Rate (bpm)</span>
          <input name="heartRate" inputMode="numeric" defaultValue={v(record?.heartRate)} placeholder="72" />
        </label>
        <label className="field">
          <span>Resp. Rate (/min)</span>
          <input name="respiratoryRate" inputMode="numeric" defaultValue={v(record?.respiratoryRate)} placeholder="16" />
        </label>
        <label className="field">
          <span>SpO₂ (%)</span>
          <input name="oxygenSaturation" inputMode="numeric" defaultValue={v(record?.oxygenSaturation)} placeholder="98" />
        </label>
        <label className="field">
          <span>Weight (kg)</span>
          <input name="weight" inputMode="decimal" defaultValue={v(record?.weight)} />
        </label>
        <label className="field">
          <span>Height (cm)</span>
          <input name="height" inputMode="decimal" defaultValue={v(record?.height)} />
        </label>
      </div>

      <p className="form-section">Assessment</p>
      <div className="form-grid">
        <label className="field full">
          <span>Chief Complaint</span>
          <input name="chiefComplaint" defaultValue={v(record?.chiefComplaint)} placeholder="What brought the patient in?" />
        </label>
        <label className="field full">
          <span>Diagnosis *</span>
          <input name="diagnosis" defaultValue={v(record?.diagnosis)} required />
        </label>
        <label className="field full">
          <span>Clinical Notes</span>
          <textarea name="notes" rows={4} defaultValue={v(record?.notes)} placeholder="Examination findings, plan, advice..." />
        </label>
      </div>

      <p className="form-section">Prescriptions</p>
      <div className="rx-rows">
        {rows.map((rx, i) => (
          <div key={rx.key} className="rx-row">
            <input name="rxMedication" defaultValue={rx.medication} placeholder="Medication" aria-label={`Medication ${i + 1}`} />
            <input name="rxDosage" defaultValue={rx.dosage} placeholder="Dosage (e.g. 500mg)" aria-label={`Dosage ${i + 1}`} />
            <input name="rxFrequency" defaultValue={rx.frequency} placeholder="Frequency (e.g. 3× daily)" aria-label={`Frequency ${i + 1}`} />
            <input name="rxDuration" defaultValue={rx.duration} placeholder="Duration (e.g. 5 days)" aria-label={`Duration ${i + 1}`} />
            <input name="rxInstructions" defaultValue={rx.instructions} placeholder="Instructions" aria-label={`Instructions ${i + 1}`} />
            <button
              type="button"
              className="icon-btn danger"
              aria-label={`Remove prescription ${i + 1}`}
              onClick={() => setRows((r) => (r.length === 1 ? [withKey(EMPTY_RX)] : r.filter((x) => x.key !== rx.key)))}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        ))}
        <button type="button" className="link-btn" onClick={() => setRows((r) => [...r, withKey(EMPTY_RX)])}>
          <i className="fa-solid fa-plus" /> Add medication
        </button>
      </div>

      <div className="form-grid follow-up">
        <label className="field">
          <span>Follow-up Date</span>
          <input type="date" name="followUpDate" defaultValue={v(record?.followUpDate)} />
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}
      {saved && !error && <p className="settings-message success">{saved}</p>}

      <div className="modal-actions">
        <button type="submit" name="complete" value="0" className="btn btn-outline" disabled={busy}>
          {busy ? "Saving..." : "Save Record"}
        </button>
        {!completed && (
          <button type="submit" name="complete" value="1" className="btn btn-success" disabled={busy}>
            Save &amp; Complete Visit
          </button>
        )}
      </div>
    </form>
  );
}
