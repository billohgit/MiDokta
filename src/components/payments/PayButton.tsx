"use client";

import { useState } from "react";
import type { CheckoutChannel } from "@prisma/client";
import { payInvoiceOnline, payMyInvoice } from "@/app/actions/payments";
import useServerAction from "@/components/ui/useServerAction";

const CHANNELS: { channel: CheckoutChannel; title: string; detail: React.ReactNode; icon: string }[] = [
  {
    channel: "MOBILE_MONEY",
    title: "Mobile money",
    detail: "Orange Money · Afrimoney",
    icon: "fa-solid fa-mobile-screen",
  },
  {
    channel: "CARD",
    title: "Card",
    detail: (
      <>
        <i className="fa-brands fa-cc-mastercard" /> Mastercard
      </>
    ),
    icon: "fa-regular fa-credit-card",
  },
];

/**
 * The patient picks mobile money or card, and we send them to a Monime checkout for that method.
 * From the public payment link pass `payKey`; from the patient portal pass `invoiceId`.
 */
export default function PayButton({ payKey, invoiceId, amount }: { payKey?: string; invoiceId?: string; amount: string }) {
  const { busy, error, run } = useServerAction();
  const [chosen, setChosen] = useState<CheckoutChannel | null>(null);

  const pay = (channel: CheckoutChannel) => {
    setChosen(channel);
    run(() => (invoiceId ? payMyInvoice(invoiceId, channel) : payInvoiceOnline(payKey ?? "", channel)), {
      onSuccess: (r) => {
        const url = (r as { url?: string }).url;
        if (url) window.location.href = url;
      },
    });
  };

  return (
    <>
      <p className="pay-choose">Pay {amount} with</p>
      <div className="pay-options">
        {CHANNELS.map((c) => (
          <button key={c.channel} type="button" className="pay-option" disabled={busy} onClick={() => pay(c.channel)}>
            <i className={`${busy && chosen === c.channel ? "fa-solid fa-spinner fa-spin" : c.icon} pay-option-icon`} />
            <span className="pay-option-text">
              <strong>{c.title}</strong>
              <small>{busy && chosen === c.channel ? "Opening payment..." : c.detail}</small>
            </span>
            <i className="fa-solid fa-chevron-right pay-option-go" />
          </button>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
    </>
  );
}
