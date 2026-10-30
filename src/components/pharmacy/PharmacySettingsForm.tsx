"use client";

import { useState } from "react";
import type { MobileWallet } from "@prisma/client";
import { savePharmacy } from "@/app/actions/pharmacy";
import useServerAction from "@/components/ui/useServerAction";
import { WALLET_OPTIONS } from "@/components/payments/wallets";

export type PharmacySettings = {
  name: string;
  address: string;
  city: string | null;
  phone: string | null;
  deliveryFee: string | null;
  payoutWallet: MobileWallet | null;
  payoutAccount: string | null;
};

/** A pharmacist's shop details: where it is, what delivery costs, and where they're paid. */
export default function PharmacySettingsForm({ pharmacy, platformPercent }: { pharmacy: PharmacySettings | null; platformPercent: string }) {
  const [wallet, setWallet] = useState<MobileWallet | "">(pharmacy?.payoutWallet ?? "");
  const [saved, setSaved] = useState(false);
  const { busy, error, submitWith } = useServerAction();

  return (
    <form className="card my-invoice form-grid" onSubmit={submitWith(savePharmacy, { onSuccess: () => setSaved(true) })} onChange={() => setSaved(false)}>
      {!pharmacy && (
        <p className="form-note full">
          <i className="fa-solid fa-store" /> Set up your pharmacy to sell to patients on MiDokta. Patients pay online when they order; you&apos;re paid
          once they confirm they have it. MiDokta keeps {platformPercent}% of the medicines; the delivery fee is all yours.
        </p>
      )}
      <label className="field full">
        <span>Pharmacy name *</span>
        <input name="name" maxLength={120} defaultValue={pharmacy?.name ?? ""} required />
      </label>
      <label className="field full">
        <span>Address *</span>
        <input name="address" maxLength={300} defaultValue={pharmacy?.address ?? ""} required placeholder="Where patients collect orders" />
      </label>
      <label className="field">
        <span>City</span>
        <input name="city" maxLength={80} defaultValue={pharmacy?.city ?? ""} />
      </label>
      <label className="field">
        <span>Phone</span>
        <input name="phone" type="tel" defaultValue={pharmacy?.phone ?? ""} />
      </label>
      <label className="field full">
        <span>Delivery fee (Le)</span>
        <input name="deliveryFee" inputMode="decimal" defaultValue={pharmacy?.deliveryFee ?? ""} placeholder="Leave empty if you don't deliver (pickup only)" />
      </label>
      <label className="field">
        <span>Pay me by</span>
        <select name="payoutWallet" value={wallet} onChange={(e) => setWallet(e.target.value as MobileWallet | "")}>
          <option value="">Not set</option>
          {WALLET_OPTIONS.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
      </label>
      {wallet && (
        <label className="field">
          <span>{wallet === "TENKIPAY" ? "Wallet number *" : "Mobile number *"}</span>
          <input name="payoutAccount" defaultValue={pharmacy?.payoutAccount ?? ""} required inputMode={wallet === "TENKIPAY" ? "text" : "tel"} />
        </label>
      )}
      {error && <p className="form-error full">{error}</p>}
      <div className="modal-actions full">
        {saved && (
          <span className="form-note">
            <i className="fa-solid fa-circle-check" /> Saved
          </span>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving..." : pharmacy ? "Save" : "Open my pharmacy"}
        </button>
      </div>
    </form>
  );
}
