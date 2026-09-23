"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createInvoice } from "@/app/actions/billing";
import useServerAction from "@/components/ui/useServerAction";
import { formatMoney, roundMoney } from "@/lib/money";
import { COMMON_SERVICES } from "./shared";

export type BillableAppointment = { id: string; patientId: string; label: string; title: string; alreadyInvoiced: boolean };

type Item = { key: number; description: string; quantity: string; unitPrice: string };

type Props = {
  patients: { id: string; name: string }[];
  appointments: BillableAppointment[];
  initialPatientId: string;
  initialAppointmentId: string;
  /** The portal this form belongs to, e.g. "/admin". */
  basePath: string;
};

export default function InvoiceForm({ patients, appointments, initialPatientId, initialAppointmentId, basePath }: Props) {
  const router = useRouter();
  const nextKey = useRef(0);
  const newItem = (description = ""): Item => ({ key: nextKey.current++, description, quantity: "1", unitPrice: "" });

  const initialAppt = appointments.find((a) => a.id === initialAppointmentId);
  const [patientId, setPatientId] = useState(initialPatientId);
  const [appointmentId, setAppointmentId] = useState(initialAppointmentId);
  const [items, setItems] = useState<Item[]>(() => [newItem(initialAppt ? `Consultation – ${initialAppt.title}` : "")]);
  const { busy, error, submitWith } = useServerAction();

  const patientAppointments = appointments.filter((a) => a.patientId === patientId);
  const selectedAppt = appointments.find((a) => a.id === appointmentId);

  const update = (key: number, field: keyof Omit<Item, "key">, value: string) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, [field]: value } : i)));

  const lineTotal = (i: Item) => roundMoney((Number(i.quantity) || 0) * (Number(i.unitPrice) || 0));
  const total = roundMoney(items.reduce((sum, i) => sum + lineTotal(i), 0));

  return (
    <form
      onSubmit={submitWith(createInvoice, { onSuccess: (r) => r.id && router.push(`${basePath}/billing/${r.id}`) })}
      className="card consult-form"
    >
      <div className="form-grid">
        <label className="field">
          <span>Patient *</span>
          <select
            name="patientId"
            value={patientId}
            onChange={(e) => {
              setPatientId(e.target.value);
              setAppointmentId("");
            }}
            required
          >
            <option value="" disabled>
              Select a patient
            </option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Appointment</span>
          <select name="appointmentId" value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)} disabled={!patientId}>
            <option value="">Not linked to an appointment</option>
            {patientAppointments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
                {a.alreadyInvoiced ? " (already invoiced)" : ""}
              </option>
            ))}
          </select>
        </label>
        {selectedAppt?.alreadyInvoiced && (
          <p className="form-warning full">
            <i className="fa-solid fa-triangle-exclamation" /> This appointment already has an invoice. Make sure you aren&apos;t billing twice.
          </p>
        )}
        <label className="field">
          <span>Due Date</span>
          <input type="date" name="dueDate" />
        </label>
      </div>

      <p className="form-section">Items</p>
      <datalist id="services">
        {COMMON_SERVICES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <div className="invoice-items">
        <div className="invoice-item head" aria-hidden="true">
          <span>Description</span>
          <span>Qty</span>
          <span>Unit Price</span>
          <span className="num">Amount</span>
          <span />
        </div>
        {items.map((item, idx) => (
          <div key={item.key} className="invoice-item">
            <input
              name="itemDescription"
              list="services"
              value={item.description}
              onChange={(e) => update(item.key, "description", e.target.value)}
              placeholder="Service or product"
              aria-label={`Item ${idx + 1} description`}
            />
            <input
              name="itemQuantity"
              type="number"
              min={1}
              step={1}
              value={item.quantity}
              onChange={(e) => update(item.key, "quantity", e.target.value)}
              aria-label={`Item ${idx + 1} quantity`}
            />
            <input
              name="itemUnitPrice"
              type="number"
              min={0}
              step="0.01"
              value={item.unitPrice}
              onChange={(e) => update(item.key, "unitPrice", e.target.value)}
              placeholder="0.00"
              aria-label={`Item ${idx + 1} unit price`}
            />
            <span className="num line-total">{formatMoney(lineTotal(item))}</span>
            <button
              type="button"
              className="icon-btn danger"
              aria-label={`Remove item ${idx + 1}`}
              onClick={() => setItems((list) => (list.length === 1 ? [newItem()] : list.filter((i) => i.key !== item.key)))}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        ))}
        <button type="button" className="link-btn" onClick={() => setItems((list) => [...list, newItem()])}>
          <i className="fa-solid fa-plus" /> Add item
        </button>
        <div className="invoice-total">
          <span>Total</span>
          <strong>{formatMoney(total)}</strong>
        </div>
      </div>

      <label className="field">
        <span>Notes</span>
        <textarea name="notes" rows={2} placeholder="Shown on the invoice" />
      </label>

      {error && <p className="form-error">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="btn btn-outline" onClick={() => router.back()}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Creating..." : "Create Invoice"}
        </button>
      </div>
    </form>
  );
}
