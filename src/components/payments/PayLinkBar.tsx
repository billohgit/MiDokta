"use client";

import { useState } from "react";
import { textPaymentLink } from "@/app/actions/payments";
import useServerAction from "@/components/ui/useServerAction";

/** The patient's online payment link on an invoice, with copy and text controls. */
export default function PayLinkBar({ invoiceId, link }: { invoiceId: string; link: string }) {
  const { busy, error, run } = useServerAction();
  const [note, setNote] = useState<string | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setNote("Link copied.");
    } catch {
      setNote("Couldn't copy automatically. Select the link and copy it.");
    }
  };

  return (
    <div className="call-link no-print">
      <label htmlFor="pay-link">Patient&apos;s payment link (mobile money or card)</label>
      <div className="call-link-row">
        <input id="pay-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn btn-outline btn-sm" onClick={copy}>
          <i className="fa-regular fa-copy btn-icon" /> Copy
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={busy}
          onClick={() => run(() => textPaymentLink(invoiceId), { onSuccess: () => setNote("Payment link texted to the patient.") })}
        >
          <i className="fa-solid fa-comment-sms btn-icon" /> {busy ? "Sending..." : "Text it to the patient"}
        </button>
      </div>
      {(error || note) && <small className={error ? "form-error" : "call-note"}>{error ?? note}</small>}
    </div>
  );
}
