"use client";

import Link from "next/link";
import { type FormEvent, startTransition, useActionState, useState } from "react";
import type { MobileWallet } from "@prisma/client";
import { type InviteSignupState, registerFromInvite } from "@/app/actions/invites";
import ImageCapture from "@/components/ui/ImageCapture";
import { WALLET_OPTIONS } from "@/components/payments/wallets";

type Props = { token: string; firstName: string; lastName: string; phone: string; fee: string | null };

/** Registering from a doctor's invitation: the visit is booked as soon as the account exists. */
export default function InviteSignupForm({ token, firstName, lastName, phone, fee }: Props) {
  const [state, action, pending] = useActionState<InviteSignupState, FormData>(registerFromInvite, { error: null });
  const [photo, setPhoto] = useState<File | null>(null);
  const [idCard, setIdCard] = useState<File | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [wallet, setWallet] = useState<MobileWallet>("ORANGE_MONEY");

  // Submitted by hand so a failed attempt keeps what was typed and the captured photos.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!photo || !idCard) return setMissing(!photo ? "Add your photo." : "Add your identity card.");
    setMissing(null);
    const formData = new FormData(e.currentTarget);
    formData.set("photo", photo);
    formData.set("idCard", idCard);
    startTransition(() => action(formData));
  };

  const error = missing ?? state.error;
  return (
    <form onSubmit={onSubmit} className="login-form">
      <input type="hidden" name="token" value={token} />
      <div className="login-row">
        <label className="field">
          <span>First name</span>
          <input name="firstName" autoComplete="given-name" defaultValue={firstName} required />
        </label>
        <label className="field">
          <span>Last name</span>
          <input name="lastName" autoComplete="family-name" defaultValue={lastName} required />
        </label>
      </div>
      <label className="field">
        <span>Phone number</span>
        <input value={phone} disabled />
        <small className="form-note">The number your doctor sent the invitation to. You can sign in with it.</small>
      </label>
      <label className="field">
        <span>Email (optional)</span>
        <input type="email" name="email" autoComplete="email" />
      </label>
      <ImageCapture label="Your photo" hint="A clear photo of your face" mode="face" value={photo} onChange={setPhoto} />
      <ImageCapture label="Identity card" hint="National ID, passport, driver's licence or voter card" mode="card" value={idCard} onChange={setIdCard} />
      <label className="field">
        <span>Password</span>
        <input type="password" name="password" autoComplete="new-password" minLength={8} required />
      </label>
      <label className="field">
        <span>Confirm password</span>
        <input type="password" name="confirmPassword" autoComplete="new-password" minLength={8} required />
      </label>
      {fee && (
        <>
          <p className="form-note">
            <i className="fa-solid fa-circle-info" /> Next you&apos;ll pay the {fee} fee. If the visit is cancelled, you get it all back to:
          </p>
          <div className="login-row">
            <label className="field">
              <span>Refund to</span>
              <select name="refundWallet" value={wallet} onChange={(e) => setWallet(e.target.value as MobileWallet)}>
                {WALLET_OPTIONS.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{wallet === "TENKIPAY" ? "Wallet number" : "Mobile number"}</span>
              <input name="refundAccount" defaultValue={phone} inputMode={wallet === "TENKIPAY" ? "text" : "tel"} required />
            </label>
          </div>
        </>
      )}
      <p className="form-note">
        <i className="fa-solid fa-lock" /> Your ID is stored privately and only administrators can see it.
      </p>
      <label className="checkbox-line terms-accept">
        <input type="checkbox" name="acceptTerms" required />
        <span>
          I have read and agree to the{" "}
          <Link href="/terms" target="_blank">
            Terms and Conditions
          </Link>
        </span>
      </label>
      {error && <p className="form-error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Registering..." : fee ? `Register and pay ${fee}` : "Register and confirm my visit"}
      </button>
    </form>
  );
}
