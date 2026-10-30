"use client";

import { useState } from "react";
import Link from "next/link";
import type { Fulfilment, PharmacyOrderStatus } from "@prisma/client";
import { cancelMyOrder, confirmMyOrder, reportMyOrder } from "@/app/actions/pharmacy";
import useServerAction from "@/components/ui/useServerAction";

type Props = { id: string; invoiceId: string; status: PharmacyOrderStatus; fulfilment: Fulfilment; autoConfirmDays: number };

/** What a patient can do with their order at each step. */
export default function OrderActions({ id, invoiceId, status, fulfilment, autoConfirmDays }: Props) {
  const { busy, error, run } = useServerAction();
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState("");

  const canCancel = status === "AWAITING_PAYMENT" || status === "PAID";
  const canConfirm = status === "DISPATCHED" || status === "DELIVERED";
  if (!canCancel && !canConfirm) return null;

  return (
    <div className="my-invoice-pay">
      {status === "DELIVERED" && (
        <p className="pay-status">
          The pharmacy says you have this order. Confirm below, or report a problem. If you do neither, it&apos;s confirmed automatically{" "}
          {autoConfirmDays} days after delivery.
        </p>
      )}
      {reporting ? (
        <div className="form-grid">
          <label className="field full">
            <span>What went wrong?</span>
            <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Nobody came to deliver it" />
          </label>
          <div className="modal-actions full">
            <button className="btn btn-outline" disabled={busy} onClick={() => setReporting(false)}>
              Back
            </button>
            <button className="btn btn-primary" disabled={busy || !note.trim()} onClick={() => run(() => reportMyOrder(id, note), { onSuccess: () => setReporting(false) })}>
              Send report
            </button>
          </div>
        </div>
      ) : (
        <div className="row-actions">
          {status === "AWAITING_PAYMENT" && (
            <Link href={`/patient/billing/${invoiceId}`} className="btn btn-primary">
              Pay now
            </Link>
          )}
          {canConfirm && (
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                run(() => confirmMyOrder(id), {
                  confirm: "Confirm you have your order? The pharmacy will then be paid, and you can't report a problem after.",
                })
              }
            >
              <i className="fa-solid fa-check btn-icon" /> {fulfilment === "PICKUP" ? "I've collected it" : "I received it"}
            </button>
          )}
          {status === "DELIVERED" && (
            <button className="btn btn-outline" disabled={busy} onClick={() => setReporting(true)}>
              I didn&apos;t get it
            </button>
          )}
          {canCancel && (
            <button
              className="btn btn-outline"
              disabled={busy}
              onClick={() =>
                run(() => cancelMyOrder(id), {
                  confirm: status === "PAID" ? "Cancel this order? You'll be refunded in full." : "Cancel this order?",
                })
              }
            >
              Cancel order
            </button>
          )}
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
