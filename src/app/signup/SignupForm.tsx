"use client";

import Link from "next/link";
import { type FormEvent, startTransition, useActionState, useState } from "react";
import { type SignupState, signup } from "@/app/actions/auth";
import { SIGNUP_ROLES } from "@/lib/roles";
import ImageCapture from "@/components/ui/ImageCapture";
import PhoneInput from "@/components/ui/PhoneInput";

const label = (role: string) => role.charAt(0) + role.slice(1).toLowerCase();

export default function SignupForm({ defaultCountry }: { defaultCountry: string }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(signup, {
    error: null,
    done: false,
    values: { firstName: "", lastName: "", email: "", country: defaultCountry, phone: "", role: "" },
  });
  const v = state.values;
  const [country, setCountry] = useState(v.country);
  const [photo, setPhoto] = useState<File | null>(null);
  const [idCard, setIdCard] = useState<File | null>(null);
  const [missing, setMissing] = useState<string | null>(null);

  // Submitted by hand rather than through <form action>: React resets a form after an action,
  // which would wipe the typed fields and the captured images whenever validation fails.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!photo || !idCard) return setMissing(!photo ? "Add your photo." : "Add your identity card.");
    setMissing(null);
    const formData = new FormData(e.currentTarget);
    formData.set("photo", photo);
    formData.set("idCard", idCard);
    startTransition(() => action(formData));
  };

  if (state.done) {
    return (
      <>
        <h1>Account created</h1>
        <p className="login-sub">
          Thanks, {v.firstName}. We&apos;re checking your photo and ID, and an administrator needs to approve your
          account before you can sign in. You&apos;ll be able to sign in with {v.email} once it&apos;s activated.
        </p>
        <Link href="/login" className="btn btn-primary login-btn">
          Back to Sign In
        </Link>
      </>
    );
  }

  const error = missing ?? state.error;

  return (
    <>
      <h1>Create an account</h1>
      <p className="login-sub">We verify your identity, then an administrator approves your account</p>
      <form onSubmit={onSubmit} className="login-form">
        <div className="login-row">
          <label className="field">
            <span>First name</span>
            <input name="firstName" autoComplete="given-name" defaultValue={v.firstName} required autoFocus />
          </label>
          <label className="field">
            <span>Last name</span>
            <input name="lastName" autoComplete="family-name" defaultValue={v.lastName} required />
          </label>
        </div>
        <label className="field">
          <span>Email</span>
          <input type="email" name="email" autoComplete="email" defaultValue={v.email} required />
        </label>
        <div className="field">
          <label htmlFor="signup-phone">Phone number</label>
          <PhoneInput
            id="signup-phone"
            name="phone"
            country={country}
            onCountryChange={setCountry}
            defaultValue={v.phone}
            required
          />
        </div>
        <label className="field">
          <span>I am a</span>
          <select name="role" defaultValue={v.role} required>
            <option value="" disabled>
              Choose your role
            </option>
            {SIGNUP_ROLES.map((r) => (
              <option key={r} value={r}>
                {label(r)}
              </option>
            ))}
          </select>
        </label>
        <ImageCapture
          label="Your photo"
          hint="A clear photo of your face"
          mode="face"
          value={photo}
          onChange={setPhoto}
        />
        <ImageCapture
          label="Identity card"
          hint="National ID, passport, driver's licence or voter card"
          mode="card"
          value={idCard}
          onChange={setIdCard}
        />
        <label className="field">
          <span>Password</span>
          <input type="password" name="password" autoComplete="new-password" minLength={8} required />
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input type="password" name="confirmPassword" autoComplete="new-password" minLength={8} required />
        </label>
        <p className="form-note">
          <i className="fa-solid fa-lock" /> Your ID is stored privately and only administrators can see it. It is
          checked automatically with AI to confirm it matches your photo and name.
        </p>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Creating account..." : "Create Account"}
        </button>
      </form>
      <p className="login-alt">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </>
  );
}
