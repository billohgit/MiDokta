"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { MobileWallet } from "@prisma/client";
import { requestAppointment, cancelMyAppointment } from "@/app/actions/patient-portal";
import { addToCart } from "@/app/actions/pharmacy";
import { sendMessage, startDirectConversation } from "@/app/actions/chat";
import { WALLET_OPTIONS } from "@/components/payments/wallets";
import type { OmegaProposal } from "@/lib/omega/types";
import type { OmegaText } from "./ui-text";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Something Omega offers to do. Nothing happens until the patient taps Confirm, which runs the same
 * server action as the app's own buttons, with all its checks (payment, refunds, who may message whom).
 */
export default function ProposalCard({ p, t }: { p: OmegaProposal; t: OmegaText }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [state, setState] = useState<"open" | "done" | "dismissed">("open");
  const [error, setError] = useState<string | null>(null);
  const [replace, setReplace] = useState(false);
  const [wallet, setWallet] = useState<MobileWallet>("ORANGE_MONEY");
  const [account, setAccount] = useState(p.kind === "book" ? (p.phone ?? "") : "");
  const [text, setText] = useState(p.kind === "message" ? p.text : "");

  if (state === "dismissed") return null;

  const run = (action: () => Promise<Result>) =>
    start(async () => {
      setError(null);
      const r = await action().catch((): Result => ({ ok: false, error: "Something went wrong. Please try again." }));
      if (r.ok) setState("done");
      else setError(r.error);
    });

  const confirm = () => {
    switch (p.kind) {
      case "book":
        return run(async () => {
          const f = new FormData();
          f.set("doctorId", p.doctorId);
          f.set("date", p.date);
          f.set("time", p.time);
          f.set("visitType", p.visitType);
          f.set("title", p.reason);
          if (p.fee) {
            f.set("refundWallet", wallet);
            f.set("refundAccount", account);
          }
          const r = await requestAppointment(f);
          if (r.ok && r.payInvoiceId) router.push(`/patient/billing/${r.payInvoiceId}`);
          return r;
        });
      case "cancel":
        return run(() => cancelMyAppointment(p.appointmentId));
      case "cart":
        return run(async () => {
          const r = await addToCart(p.productId, p.quantity, replace);
          if (!r.ok && r.otherPharmacy) setReplace(true);
          return r;
        });
      case "message":
        return run(async () => {
          const chat = await startDirectConversation(p.doctorId);
          if (!chat.ok) return chat;
          const sent = await sendMessage(chat.id, text, false);
          return sent.ok ? { ok: true } : sent;
        });
    }
  };

  const done =
    p.kind === "book" ? (p.fee ? t.book.pay : t.book.done) : p.kind === "cancel" ? t.cancel.done : p.kind === "cart" ? t.cart.done : t.message.done;

  return (
    <div className={`omega-proposal${state === "done" ? " done" : ""}`}>
      {p.kind === "book" && (
        <>
          <strong>{t.book.title}</strong>
          <p>
            {p.doctorName}
            {p.specialty ? ` · ${p.specialty}` : ""}
            <br />
            {p.whenLabel} · {p.visitType === "VIDEO_CALL" ? t.book.video : t.book.inPerson}
            <br />
            {p.reason}
          </p>
          <p className="omega-note">{p.fee ? t.book.fee(p.fee) : t.book.free}</p>
          {p.fee && state === "open" && (
            <div className="omega-proposal-refund">
              <span>{t.book.refundTo}</span>
              <select value={wallet} onChange={(e) => setWallet(e.target.value as MobileWallet)} aria-label={t.book.refundTo}>
                {WALLET_OPTIONS.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
              <input value={account} onChange={(e) => setAccount(e.target.value)} inputMode={wallet === "TENKIPAY" ? "text" : "tel"} aria-label="Refund account" />
            </div>
          )}
        </>
      )}
      {p.kind === "cancel" && (
        <>
          <strong>{t.cancel.title}</strong>
          <p>{p.label}</p>
          {p.paid && <p className="omega-note">{t.cancel.refund}</p>}
        </>
      )}
      {p.kind === "cart" && (
        <>
          <strong>{t.cart.title}</strong>
          <p>
            {p.quantity} × {p.name}
            <br />
            {p.pharmacy} · {p.price}
          </p>
        </>
      )}
      {p.kind === "message" && (
        <>
          <strong>{t.message.title}</strong>
          <p>{p.doctorName}</p>
          {state === "open" ? (
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} aria-label="Message" />
          ) : (
            <p className="omega-proposal-quote">{text}</p>
          )}
        </>
      )}

      {error && <p className="omega-proposal-error">{error}</p>}

      {state === "done" ? (
        <p className="omega-proposal-done">
          <i className="fa-solid fa-circle-check" /> {done}{" "}
          {p.kind === "cart" && <Link href="/patient/pharmacy/cart">{t.cart.goCart}</Link>}
          {p.kind === "message" && <Link href="/patient/chat">{t.message.openChat}</Link>}
        </p>
      ) : (
        <div className="omega-proposal-actions">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || (p.kind === "message" && !text.trim())} onClick={confirm}>
            {busy ? t.working : replace ? t.cart.replace : t.confirm}
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => setState("dismissed")}>
            {t.noThanks}
          </button>
        </div>
      )}
    </div>
  );
}
