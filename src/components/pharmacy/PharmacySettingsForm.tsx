"use client";

import { useState } from "react";
import type { MobileWallet } from "@prisma/client";
import { savePharmacy } from "@/app/actions/pharmacy";
import useServerAction from "@/components/ui/useServerAction";
import { WALLET_OPTIONS } from "@/components/payments/wallets";
import { directionsUrl } from "@/lib/geo";

export type PharmacySettings = {
  name: string;
  address: string;
  city: string | null;
  phone: string | null;
  deliveryFee: string | null;
  latitude: number | null;
  longitude: number | null;
  payoutWallet: MobileWallet | null;
  payoutAccount: string | null;
};

/** A pharmacist's shop details: where it is, what delivery costs, and where they're paid. */
export default function PharmacySettingsForm({ pharmacy, platformPercent }: { pharmacy: PharmacySettings | null; platformPercent: string }) {
  const [wallet, setWallet] = useState<MobileWallet | "">(pharmacy?.payoutWallet ?? "");
  const [saved, setSaved] = useState(false);
  const { busy, error, setError, submitWith } = useServerAction();
  const [position, setPosition] = useState(
    pharmacy?.latitude != null && pharmacy?.longitude != null ? { lat: pharmacy.latitude, lng: pharmacy.longitude } : null,
  );
  const [locating, setLocating] = useState(false);

  // Standing in the pharmacy, the phone knows where it is better than any typed address.
  const useCurrentLocation = () => {
    if (!("geolocation" in navigator)) return setError("This browser can't share its location.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) });
        setSaved(false);
        setLocating(false);
      },
      () => {
        setError("Couldn't get your location. Allow location access for this site and try again.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

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
      <div className="field full">
        <span>Pharmacy location</span>
        <input type="hidden" name="latitude" value={position?.lat ?? ""} />
        <input type="hidden" name="longitude" value={position?.lng ?? ""} />
        <div className="row-actions">
          <button type="button" className="btn btn-sm btn-outline" onClick={useCurrentLocation} disabled={locating}>
            <i className={`fa-solid ${locating ? "fa-spinner fa-spin" : "fa-location-crosshairs"} btn-icon`} />
            {position ? "Update to my current location" : "Use my current location"}
          </button>
          {position && (
            <>
              <a href={directionsUrl(null, position)} target="_blank" rel="noreferrer" className="link-btn">
                <i className="fa-solid fa-map-location-dot" /> Check on the map
              </a>
              <button type="button" className="link-btn" onClick={() => setPosition(null)}>
                Remove
              </button>
            </>
          )}
        </div>
        <small className="form-note">
          {position
            ? "Set. Patients see how far your pharmacy is from them. Press Save to keep a change."
            : "Tap this while you're inside the pharmacy, so patients can see how far away you are."}
        </small>
      </div>
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
