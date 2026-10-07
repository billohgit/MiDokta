"use client";

import { useActionState, useState } from "react";
import { type PatientLoginState, patientLogin } from "@/app/actions/auth";
import PhoneInput from "@/components/ui/PhoneInput";

/** Patients sign in with a code texted to their phone: number, then code, then (shared numbers) who. */
export default function PatientLoginForm({ defaultCountry }: { defaultCountry: string }) {
  const [state, action, pending] = useActionState<PatientLoginState, FormData>(patientLogin, {
    step: "phone",
    error: null,
    notice: null,
    country: defaultCountry,
    identifier: "",
    phone: "",
    codeId: null,
    choices: [],
  });
  const [country, setCountry] = useState(state.country);

  if (state.step === "choose") {
    return (
      <form action={action} className="login-form">
        <p className="login-step-text">This number is shared by more than one patient. Who is signing in?</p>
        <div className="login-choices">
          {state.choices.map((c) => (
            <button key={c.id} type="submit" name="userId" value={c.id} className="btn btn-outline" disabled={pending}>
              <i className="fa-regular fa-user btn-icon" /> {c.name}
            </button>
          ))}
        </div>
        {state.error && <p className="form-error">{state.error}</p>}
        <button type="submit" name="intent" value="back" className="link-btn" formNoValidate>
          Use a different number
        </button>
      </form>
    );
  }

  if (state.step === "code") {
    return (
      <form action={action} className="login-form">
        <p className="login-step-text">
          {state.notice ?? "Enter the code we texted to you."} <strong>{state.phone}</strong>
        </p>
        <label className="field">
          <span>6-digit code</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            placeholder="123456"
            className="code-input"
            required
            autoFocus
          />
        </label>
        {state.error && <p className="form-error">{state.error}</p>}
        <button type="submit" name="intent" value="verify" className="btn btn-primary" disabled={pending}>
          {pending ? "Checking..." : "Sign In"}
        </button>
        <div className="login-links">
          <button type="submit" name="intent" value="resend" className="link-btn" formNoValidate disabled={pending}>
            Send a new code
          </button>
          <button type="submit" name="intent" value="back" className="link-btn" formNoValidate disabled={pending}>
            Change number
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={action} className="login-form">
      <input type="hidden" name="intent" value="send" />
      <div className="field">
        <label htmlFor="patient-phone">Phone number</label>
        <PhoneInput
          id="patient-phone"
          name="identifier"
          country={country}
          onCountryChange={setCountry}
          defaultValue={state.identifier}
          required
          autoFocus
        />
        <small className="form-note">Use the number the clinic has for you. We&apos;ll text you a code.</small>
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Sending..." : "Text me a code"}
      </button>
    </form>
  );
}
