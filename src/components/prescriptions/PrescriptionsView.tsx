"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { dispensePrescription, undoDispense } from "@/app/actions/prescriptions";
import Avatar from "@/components/appointments/Avatar";
import { formatDate, formatTime } from "@/components/appointments/shared";
import type { MedicationOption } from "@/components/inventory/types";
import Modal from "@/components/ui/Modal";
import useServerAction from "@/components/ui/useServerAction";
import type { PrescriptionRow } from "./types";

const FILTERS = ["pending", "dispensed", "all"] as const;
type Filter = (typeof FILTERS)[number];

const LABEL: Record<Filter, string> = { pending: "To dispense", dispensed: "Dispensed", all: "All" };

const units = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

const optionLabel = (m: MedicationOption) => [m.name, m.strength].filter(Boolean).join(" ");

/** The pharmacist's queue: prescriptions written by doctors, newest first. */
export default function PrescriptionsView({
  prescriptions,
  medications,
}: {
  prescriptions: PrescriptionRow[];
  medications: MedicationOption[];
}) {
  const [filter, setFilter] = useState<Filter>("pending");
  const [query, setQuery] = useState("");
  const [dispensing, setDispensing] = useState<PrescriptionRow | null>(null);
  const { busy, error, run } = useServerAction();

  const count = (f: Filter) =>
    prescriptions.filter((p) => f === "all" || (f === "dispensed" ? p.dispensedAt : !p.dispensedAt)).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return prescriptions.filter(
      (p) =>
        (filter === "all" || (filter === "dispensed" ? p.dispensedAt : !p.dispensedAt)) &&
        (!q ||
          [p.medication, `${p.patient.firstName} ${p.patient.lastName}`, p.doctor].some((v) =>
            v.toLowerCase().includes(q)
          ))
    );
  }, [prescriptions, filter, query]);

  return (
    <div className={busy ? "is-busy" : undefined}>
      <div className="appt-header">
        <div>
          <h2 className="section-heading">Prescriptions</h2>
          <p className="section-sub">
            {count("pending") === 1 ? "1 prescription" : `${count("pending")} prescriptions`} waiting to be dispensed
          </p>
        </div>
        <div className="appt-header-actions">
          <label className="search">
            <i className="fa-solid fa-magnifying-glass" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Medication, patient or doctor..."
            />
          </label>
        </div>
      </div>

      {error && <p className="form-error page-error">{error}</p>}

      <div className="all-header">
        <div className="segmented" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              className={filter === f ? "on" : ""}
              onClick={() => setFilter(f)}
            >
              {LABEL[f]} ({count(f)})
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty-banner">No prescriptions found.</div>
      ) : (
        <div className="card table-wrap">
          <table className="appt-table">
            <thead>
              <tr>
                <th>Medication</th>
                <th>Patient</th>
                <th>Prescribed</th>
                <th>By</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.medication}</strong>
                    <br />
                    <span className="section-sub">
                      {p.dosage} · {p.frequency} · {p.duration}
                    </span>
                    {p.instructions && (
                      <>
                        <br />
                        <span className="section-sub">{p.instructions}</span>
                      </>
                    )}
                  </td>
                  <td>
                    <Link href={`/staff/patients/${p.patient.id}`} className="person-cell">
                      <Avatar person={p.patient} size={36} />
                      <span>
                        {p.patient.firstName} {p.patient.lastName}
                      </span>
                    </Link>
                    {p.patient.allergies && <span className="alert-pill">Allergies: {p.patient.allergies}</span>}
                  </td>
                  <td>
                    {formatDate(p.prescribedAt)}
                    <br />
                    <span className="section-sub">{formatTime(p.prescribedAt)}</span>
                  </td>
                  <td>{p.doctor}</td>
                  <td>
                    {p.dispensedAt ? (
                      <>
                        <span className="status-pill status-completed">Dispensed</span>
                        <br />
                        <span className="section-sub">
                          {formatDate(p.dispensedAt)}
                          {p.dispensedBy && ` · ${p.dispensedBy}`}
                        </span>
                        {p.dispensedFrom && (
                          <>
                            <br />
                            <span className="section-sub">
                              {units(p.dispensedFrom.quantity, p.dispensedFrom.unit)} of {p.dispensedFrom.medication}{" "}
                              from stock
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <span className="status-pill status-pending">To dispense</span>
                    )}
                  </td>
                  <td className="row-actions">
                    {p.dispensedAt ? (
                      <button
                        className="btn btn-sm btn-outline"
                        disabled={busy}
                        onClick={() =>
                          run(() => undoDispense(p.id), {
                            confirm: p.dispensedFrom
                              ? `Mark ${p.medication} as not dispensed? ${units(
                                  p.dispensedFrom.quantity,
                                  p.dispensedFrom.unit
                                )} will go back into stock.`
                              : `Mark ${p.medication} as not dispensed?`,
                          })
                        }
                      >
                        Undo
                      </button>
                    ) : (
                      <button className="btn btn-sm btn-success" disabled={busy} onClick={() => setDispensing(p)}>
                        Dispense
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dispensing && (
        <DispenseForm
          prescription={dispensing}
          medications={medications}
          onClose={() => setDispensing(null)}
        />
      )}
    </div>
  );
}

/**
 * Records the hand-over. Doctors write medication names free-hand, so the pharmacist
 * confirms which stock item it maps to — or leaves it blank for anything not stocked here.
 */
function DispenseForm({
  prescription,
  medications,
  onClose,
}: {
  prescription: PrescriptionRow;
  medications: MedicationOption[];
  onClose: () => void;
}) {
  const { busy, error, submitWith } = useServerAction();
  const [medicationId, setMedicationId] = useState(prescription.suggestedMedicationId ?? "");
  const chosen = medications.find((m) => m.id === medicationId);

  return (
    <Modal title={`Dispense ${prescription.medication}`} onClose={onClose}>
      <form onSubmit={submitWith(dispensePrescription, { onSuccess: onClose })} className="form-grid">
        <input type="hidden" name="id" value={prescription.id} />

        <p className="field full section-sub">
          {prescription.patient.firstName} {prescription.patient.lastName} · {prescription.dosage} ·{" "}
          {prescription.frequency} · {prescription.duration}
          {prescription.instructions && ` · ${prescription.instructions}`}
        </p>
        {prescription.patient.allergies && (
          <p className="field full">
            <span className="alert-pill">Allergies: {prescription.patient.allergies}</span>
          </p>
        )}

        <label className="field full">
          <span>Take from stock</span>
          <select name="medicationId" value={medicationId} onChange={(e) => setMedicationId(e.target.value)}>
            <option value="">Not stocked here — just record the hand-over</option>
            {medications.map((m) => (
              <option key={m.id} value={m.id} disabled={m.quantity === 0}>
                {optionLabel(m)} — {m.quantity === 0 ? "out of stock" : `${units(m.quantity, m.unit)} on hand`}
              </option>
            ))}
          </select>
        </label>

        {chosen && (
          <label className="field">
            <span>Units handed over *</span>
            <input type="number" name="quantity" min="1" max={chosen.quantity} step="1" defaultValue="1" required />
          </label>
        )}

        {error && <p className="form-error full">{error}</p>}
        <div className="modal-actions full">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving..." : "Dispense"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
