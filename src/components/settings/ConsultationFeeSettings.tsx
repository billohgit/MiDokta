"use client";

import { useState, useTransition } from "react";
import type { MobileWallet, PayoutStatus } from "@prisma/client";
import { saveConsultationSettings } from "@/app/actions/consultations";
import { WALLET_OPTIONS } from "@/components/payments/wallets";

const PAYOUT_STATUS: Record<PayoutStatus, string> = {
  PENDING: "Waiting",
  PROCESSING: "Sending",
  COMPLETED: "Paid",
  FAILED: "Failed (the clinic will pay you by hand)",
};

/** Amounts arrive formatted; `fee` is the plain number for the input. */
export type EarningRow = { id: string; date: string; patient: string; amount: string; status: PayoutStatus; note: string | null };

type Props = {
  fee: string | null;
  wallet: MobileWallet | null;
  account: string | null;
  /** The percentage the platform keeps, e.g. "10". */
  platformPercent: string;
  earnings: EarningRow[];
  totalPaid: string;
};

/** A doctor's consultation fee, where their share is paid, and what they've been paid so far. */
export default function ConsultationFeeSettings({ fee, wallet, account, platformPercent, earnings, totalPaid }: Props) {
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [chosen, setChosen] = useState<MobileWallet | "">(wallet ?? "");

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startSaving(async () => {
      const result = await saveConsultationSettings(formData);
      setMessage(result.ok ? { type: "success", text: "Saved." } : { type: "error", text: result.error });
    });
  };

  return (
    <>
      <form onSubmit={save}>
        <section className="card details-card">
          <div className="details-head">
            <h3>Consultation Fee</h3>
          </div>
          <p className="form-note">
            Patients pay this when they book you, before the request reaches you. Mi Dokta keeps {platformPercent}% and sends you the rest when
            you complete the visit. If you decline or the visit is cancelled, the patient gets the whole fee back. Leave the fee empty to see
            patients for free.
          </p>
          <div className="details-grid">
            <div className="detail-row">
              <label className="detail-label" htmlFor="f-consultationFee">
                Fee (Le):
              </label>
              <input
                id="f-consultationFee"
                name="consultationFee"
                inputMode="decimal"
                defaultValue={fee ?? ""}
                placeholder="e.g. 150"
                className="detail-input"
              />
            </div>
            <div className="detail-row">
              <label className="detail-label" htmlFor="f-payoutWallet">
                Pay me by:
              </label>
              <select
                id="f-payoutWallet"
                name="payoutWallet"
                value={chosen}
                onChange={(e) => setChosen(e.target.value as MobileWallet | "")}
                className="detail-input"
              >
                <option value="">Not set</option>
                {WALLET_OPTIONS.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>
            {chosen && (
              <div className="detail-row">
                <label className="detail-label" htmlFor="f-payoutAccount">
                  {chosen === "TENKIPAY" ? "Wallet number:" : "Mobile number:"}
                </label>
                <input
                  id="f-payoutAccount"
                  name="payoutAccount"
                  defaultValue={account ?? ""}
                  inputMode={chosen === "TENKIPAY" ? "text" : "tel"}
                  required
                  className="detail-input"
                />
              </div>
            )}
          </div>
          {message && <p className={`settings-message ${message.type}`}>{message.text}</p>}
        </section>
        <div className="settings-actions">
          <button type="submit" className="btn btn-primary btn-save" disabled={saving}>
            {saving ? "Saving..." : "Save Fee"}
          </button>
        </div>
      </form>

      <section className="card details-card">
        <div className="details-head">
          <h3>Consultation Earnings</h3>
          <span>Paid to you: {totalPaid}</span>
        </div>
        {earnings.length === 0 ? (
          <p className="form-note">Nothing yet. Your share of each fee appears here when you complete the visit.</p>
        ) : (
          <div className="table-wrap">
            <table className="appt-table">
              <thead>
                <tr>
                  <th>Visit</th>
                  <th>Patient</th>
                  <th className="num">Your share</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {earnings.map((e) => (
                  <tr key={e.id}>
                    <td>{e.date}</td>
                    <td>{e.patient}</td>
                    <td className="num">{e.amount}</td>
                    <td>{e.note ?? PAYOUT_STATUS[e.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
