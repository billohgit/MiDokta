"use client";

import { useMemo, useState } from "react";
import {
  adjustStock,
  deleteMedication,
  receiveStock,
  saveMedication,
  setMedicationActive,
} from "@/app/actions/inventory";
import { formatDate, formatTime } from "@/components/appointments/shared";
import Modal from "@/components/ui/Modal";
import useServerAction from "@/components/ui/useServerAction";
import { formatMoney } from "@/lib/money";
import { type MedicationRow, type MovementRow, stockLevel } from "./types";

const FILTERS = ["all", "low", "inactive"] as const;
type Filter = (typeof FILTERS)[number];

const LABEL: Record<Filter, string> = { all: "In stock list", low: "Needs reordering", inactive: "Inactive" };

const LEVEL_PILL = { ok: "status-confirmed", low: "status-pending", out: "status-cancelled" } as const;
const LEVEL_TEXT = { ok: "In stock", low: "Low", out: "Out of stock" } as const;

const MOVEMENT_LABEL = { RECEIVED: "Delivery", DISPENSED: "Dispensed", ADJUSTED: "Adjustment" } as const;

const units = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

const describe = (m: { name: string; strength: string | null; form: string | null }) =>
  [m.name, m.strength, m.form].filter(Boolean).join(" · ");

type Props = {
  medications: MedicationRow[];
  movements: MovementRow[];
  /** Deleting a medication outright is admin-only; pharmacists deactivate instead. */
  canDelete: boolean;
};

/** The pharmacy stock list: what is on the shelf, what is running out, and why it moved. */
export default function InventoryView({ medications, movements, canDelete }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<MedicationRow | "new" | null>(null);
  const [receiving, setReceiving] = useState<MedicationRow | "any" | null>(null);
  const [adjusting, setAdjusting] = useState<MedicationRow | null>(null);
  const { busy, error, run } = useServerAction();

  const active = medications.filter((m) => m.isActive);
  const low = active.filter((m) => stockLevel(m) !== "ok");
  const out = active.filter((m) => m.quantity === 0);

  const count = (f: Filter) =>
    f === "all" ? active.length : f === "low" ? low.length : medications.length - active.length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return medications.filter(
      (m) =>
        (filter === "inactive" ? !m.isActive : m.isActive && (filter === "all" || stockLevel(m) !== "ok")) &&
        (!q || describe(m).toLowerCase().includes(q))
    );
  }, [medications, filter, query]);

  return (
    <div className={busy ? "is-busy" : undefined}>
      <div className="appt-header">
        <div>
          <h2 className="section-heading">Pharmacy Stock</h2>
          <p className="section-sub">
            {units(active.length, "medication")} stocked
            {low.length > 0 && ` · ${low.length} need${low.length === 1 ? "s" : ""} reordering`}
            {out.length > 0 && ` · ${out.length} out of stock`}
          </p>
        </div>
        <div className="appt-header-actions">
          <label className="search">
            <i className="fa-solid fa-magnifying-glass" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search medications..." />
          </label>
          <button className="btn btn-outline btn-lg" onClick={() => setReceiving("any")} disabled={active.length === 0}>
            <i className="fa-solid fa-truck-ramp-box btn-icon" /> Receive Stock
          </button>
          <button className="btn btn-primary btn-lg" onClick={() => setEditing("new")}>
            <i className="fa-solid fa-plus btn-icon" /> Add Medication
          </button>
        </div>
      </div>

      {error && <p className="form-error page-error">{error}</p>}

      {low.length > 0 && filter !== "low" && (
        <div className="stock-alert">
          <i className="fa-solid fa-triangle-exclamation" />{" "}
          {low.length === 1
            ? `${describe(low[0])} is ${low[0].quantity === 0 ? "out of stock" : "running low"}.`
            : `${low.length} medications are at or below their reorder level.`}{" "}
          <button className="link-btn" onClick={() => setFilter("low")}>
            Show them
          </button>
        </div>
      )}

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
        <div className="empty-banner">No medications found.</div>
      ) : (
        <div className="card table-wrap">
          <table className="appt-table">
            <thead>
              <tr>
                <th>Medication</th>
                <th>On hand</th>
                <th>Dispensed (30d)</th>
                <th>Unit price</th>
                <th>Last delivery</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => {
                const level = stockLevel(m);
                return (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.name}</strong>
                      {m.strength && ` ${m.strength}`}
                      <br />
                      <span className="section-sub">{m.form ?? "—"}</span>
                      {m.notes && (
                        <>
                          <br />
                          <span className="section-sub">{m.notes}</span>
                        </>
                      )}
                    </td>
                    <td>
                      <strong className="stock-qty">{units(m.quantity, m.unit)}</strong>
                      <br />
                      <span className={`status-pill ${LEVEL_PILL[level]}`}>{LEVEL_TEXT[level]}</span>
                      <br />
                      <span className="section-sub">Reorder at {m.reorderLevel}</span>
                    </td>
                    <td>{m.dispensed30d}</td>
                    <td>{m.unitPrice ? formatMoney(m.unitPrice) : "—"}</td>
                    <td>{m.lastReceivedAt ? formatDate(m.lastReceivedAt) : "—"}</td>
                    <td className="row-actions">
                      {m.isActive && (
                        <>
                          <button className="btn btn-sm btn-success" disabled={busy} onClick={() => setReceiving(m)}>
                            Receive
                          </button>
                          <button className="btn btn-sm btn-outline" disabled={busy} onClick={() => setAdjusting(m)}>
                            Adjust
                          </button>
                        </>
                      )}
                      <button className="btn btn-sm btn-outline" disabled={busy} onClick={() => setEditing(m)}>
                        Edit
                      </button>
                      <button
                        className="btn btn-sm btn-outline"
                        disabled={busy}
                        onClick={() =>
                          run(() => setMedicationActive(m.id, !m.isActive), {
                            confirm: m.isActive ? `Stop stocking ${describe(m)}?` : undefined,
                          })
                        }
                      >
                        {m.isActive ? "Deactivate" : "Activate"}
                      </button>
                      {canDelete && (
                        <button
                          className="icon-btn danger"
                          disabled={busy}
                          aria-label={`Delete ${m.name}`}
                          title="Delete"
                          onClick={() =>
                            run(() => deleteMedication(m.id), {
                              confirm: `Delete ${describe(m)}? This cannot be undone.`,
                            })
                          }
                        >
                          <i className="fa-solid fa-trash" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <section className="stock-history">
        <h3 className="section-heading">Recent stock movements</h3>
        {movements.length === 0 ? (
          <div className="empty-banner">Nothing has moved in or out yet.</div>
        ) : (
          <div className="card table-wrap">
            <table className="appt-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Medication</th>
                  <th>Movement</th>
                  <th>Change</th>
                  <th>On hand after</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((mv) => (
                  <tr key={mv.id}>
                    <td>
                      {formatDate(mv.createdAt)}
                      <br />
                      <span className="section-sub">{formatTime(mv.createdAt)}</span>
                    </td>
                    <td>{mv.medication}</td>
                    <td>
                      {MOVEMENT_LABEL[mv.type]}
                      {mv.note && (
                        <>
                          <br />
                          <span className="section-sub">{mv.note}</span>
                        </>
                      )}
                    </td>
                    <td className={mv.change < 0 ? "stock-down" : "stock-up"}>
                      {mv.change > 0 ? `+${mv.change}` : mv.change}
                    </td>
                    <td>{mv.balance}</td>
                    <td>{mv.recordedBy ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && <MedicationForm medication={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {receiving && (
        <ReceiveForm
          medications={active}
          selected={receiving === "any" ? null : receiving}
          onClose={() => setReceiving(null)}
        />
      )}
      {adjusting && <AdjustForm medication={adjusting} onClose={() => setAdjusting(null)} />}
    </div>
  );
}

function MedicationForm({ medication, onClose }: { medication: MedicationRow | null; onClose: () => void }) {
  const { busy, error, submitWith } = useServerAction();

  return (
    <Modal title={medication ? `Edit ${medication.name}` : "Add Medication"} onClose={onClose}>
      <form onSubmit={submitWith(saveMedication, { onSuccess: onClose })} className="form-grid">
        <input type="hidden" name="id" value={medication?.id ?? ""} />
        <label className="field full">
          <span>Name *</span>
          <input name="name" defaultValue={medication?.name} placeholder="Amoxicillin" required />
        </label>
        <label className="field">
          <span>Strength</span>
          <input name="strength" defaultValue={medication?.strength ?? ""} placeholder="500mg" />
        </label>
        <label className="field">
          <span>Form</span>
          <input name="form" defaultValue={medication?.form ?? ""} placeholder="Capsule" />
        </label>
        <label className="field">
          <span>Counted in</span>
          <input name="unit" defaultValue={medication?.unit ?? "tablet"} placeholder="tablet" />
        </label>
        <label className="field">
          <span>Unit price</span>
          <input type="number" name="unitPrice" step="0.01" min="0" defaultValue={medication?.unitPrice ?? ""} />
        </label>
        {medication ? (
          <p className="field full section-sub">
            On hand: <strong>{units(medication.quantity, medication.unit)}</strong>. Use Receive or Adjust to change it,
            so every movement is recorded.
          </p>
        ) : (
          <label className="field">
            <span>Opening stock</span>
            <input type="number" name="quantity" min="0" step="1" defaultValue="0" />
          </label>
        )}
        <label className="field">
          <span>Reorder at</span>
          <input type="number" name="reorderLevel" min="0" step="1" defaultValue={medication?.reorderLevel ?? 0} />
        </label>
        <label className="field full">
          <span>Notes</span>
          <input name="notes" defaultValue={medication?.notes ?? ""} placeholder="Storage, supplier, cautions..." />
        </label>
        {error && <p className="form-error full">{error}</p>}
        <div className="modal-actions full">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving..." : medication ? "Save Changes" : "Add Medication"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReceiveForm({
  medications,
  selected,
  onClose,
}: {
  medications: MedicationRow[];
  selected: MedicationRow | null;
  onClose: () => void;
}) {
  const { busy, error, submitWith } = useServerAction();

  return (
    <Modal title="Receive Stock" onClose={onClose}>
      <form onSubmit={submitWith(receiveStock, { onSuccess: onClose })} className="form-grid">
        <label className="field full">
          <span>Medication *</span>
          <select name="medicationId" defaultValue={selected?.id ?? ""} required>
            <option value="" disabled>
              Choose a medication...
            </option>
            {medications.map((m) => (
              <option key={m.id} value={m.id}>
                {describe(m)} — {units(m.quantity, m.unit)} on hand
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Units received *</span>
          <input type="number" name="quantity" min="1" step="1" required autoFocus />
        </label>
        <label className="field">
          <span>Note</span>
          <input name="note" placeholder="Supplier, batch, expiry..." />
        </label>
        {error && <p className="form-error full">{error}</p>}
        <div className="modal-actions full">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving..." : "Add to Stock"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AdjustForm({ medication, onClose }: { medication: MedicationRow; onClose: () => void }) {
  const { busy, error, submitWith } = useServerAction();

  return (
    <Modal title={`Correct stock — ${medication.name}`} onClose={onClose}>
      <form onSubmit={submitWith(adjustStock, { onSuccess: onClose })} className="form-grid">
        <input type="hidden" name="medicationId" value={medication.id} />
        <p className="field full section-sub">
          The system has <strong>{units(medication.quantity, medication.unit)}</strong> on the shelf. Enter what you
          actually counted.
        </p>
        <label className="field">
          <span>Counted on hand *</span>
          <input type="number" name="quantity" min="0" step="1" defaultValue={medication.quantity} required autoFocus />
        </label>
        <label className="field">
          <span>Reason *</span>
          <input name="note" placeholder="Stock count, expired, damaged..." required />
        </label>
        {error && <p className="form-error full">{error}</p>}
        <div className="modal-actions full">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving..." : "Correct Stock"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
