"use client";

import { useState } from "react";
import { recordPayment, voidInvoice } from "@/app/actions/billing";
import Modal from "@/components/ui/Modal";
import useServerAction from "@/components/ui/useServerAction";
import { formatMoney } from "@/lib/money";
import { PAYMENT_METHOD_LABEL } from "./shared";

type Props = { invoiceId: string; number: string; balance: number; canPay: boolean; canVoid: boolean };

export default function InvoiceActions({ invoiceId, number, balance, canPay, canVoid }: Props) {
  const [paying, setPaying] = useState(false);
  const { busy, error, run } = useServerAction();

  return (
    <div className="doctor-detail-actions">
      <div className="doctor-actions">
        {canPay && (
          <button className="btn btn-success btn-sm" onClick={() => setPaying(true)}>
            <i className="fa-solid fa-money-bill-wave btn-icon" /> Record Payment
          </button>
        )}
        <button className="btn btn-outline btn-sm" onClick={() => window.print()}>
          <i className="fa-solid fa-print btn-icon" /> Print
        </button>
        {canVoid && (
          <button
            className="btn btn-outline btn-sm danger-text"
            disabled={busy}
            onClick={() => run(() => voidInvoice(invoiceId), { confirm: `Void ${number}? This cannot be undone.` })}
          >
            Void
          </button>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
      {paying && <PaymentModal invoiceId={invoiceId} number={number} balance={balance} onClose={() => setPaying(false)} />}
    </div>
  );
}

function PaymentModal({ invoiceId, number, balance, onClose }: { invoiceId: string; number: string; balance: number; onClose: () => void }) {
  const { busy, error, submitWith } = useServerAction();

  return (
    <Modal title={`Record Payment · ${number}`} onClose={onClose}>
      <form onSubmit={submitWith(recordPayment, { onSuccess: onClose })} className="form-grid">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <p className="full section-sub">Balance due: {formatMoney(balance)}</p>
        <label className="field">
          <span>Amount *</span>
          <input name="amount" type="number" min="0.01" max={balance} step="0.01" defaultValue={balance.toFixed(2)} required />
        </label>
        <label className="field">
          <span>Method *</span>
          <select name="method" defaultValue="CASH" required>
            {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field full">
          <span>Reference</span>
          <input name="reference" placeholder="Receipt, transaction or claim number" />
        </label>
        {error && <p className="form-error full">{error}</p>}
        <div className="modal-actions full">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-success" disabled={busy}>
            {busy ? "Saving..." : "Record Payment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
