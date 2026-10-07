"use client";

import { payInvoiceOnline, payMyInvoice } from "@/app/actions/payments";
import useServerAction from "@/components/ui/useServerAction";

/**
 * Starts an online checkout for the invoice and sends the patient to Monime to pay. From the public
 * payment link pass `payKey`; from the patient portal pass `invoiceId`.
 */
export default function PayButton({ payKey, invoiceId, label }: { payKey?: string; invoiceId?: string; label: string }) {
  const { busy, error, run } = useServerAction();

  return (
    <>
      <button
        type="button"
        className="btn btn-success pay-btn"
        disabled={busy}
        onClick={() =>
          run(() => (invoiceId ? payMyInvoice(invoiceId) : payInvoiceOnline(payKey ?? "")), {
            onSuccess: (r) => {
              const url = (r as { url?: string }).url;
              if (url) window.location.href = url;
            },
          })
        }
      >
        {busy ? "Opening payment..." : label}
      </button>
      {error && <p className="form-error">{error}</p>}
    </>
  );
}
