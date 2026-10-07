"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { type LoginState, type PatientLoginState, login, patientLogin } from "@/app/actions/auth";
import PhoneInput from "@/components/ui/PhoneInput";

type Method = "phone" | "email";

/** Patients sign in with a code texted to their phone, or with their email and password. */
export default function PatientLoginForm({ defaultCountry }: { defaultCountry: string }) {
  const [method, setMethod] = useState<Method>("phone");

  return (
    <>
      <div className="segmented login-method" role="tablist" aria-label="Sign in with">
        {(["phone", "email"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={method === m} className={method === m ? "on" : undefined} onClick={() => setMethod(m)}>
            <i className={m === "email" ? "fa-regular fa-envelope" : "fa-solid fa-phone"} /> {m === "email" ? "Email" : "Phone"}
          </button>
        ))}
      </div>
      {method === "phone" ? <PhoneCodeForm defaultCountry={defaultCountry} /> : <EmailPasswordForm />}
      <p className="login-alt">
        Don&apos;t have an account? <Link href="/signup">Create one</Link>
      </p>
    </>
  );
}

function EmailPasswordForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {
    error: null,
    method: "email",
    identifier: "",
    country: "",
  });

  return (
    <form action={action} className="login-form">
      <input type="hidden" name="method" value="email" />
      <label className="field">
        <span>Email</span>
        <input type="email" name="identifier" autoComplete="email" defaultValue={state.identifier} required autoFocus />
      </label>
      <label className="field">
        <span>Password</span>
        <input type="password" name="password" autoComplete="current-password" required />
        <small className="form-note">No password yet? Sign in with your phone, then set one in Settings.</small>
      </label>
      {state.error && <p className="form-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}

/** Number, then the texted code, then (shared numbers) who is signing in. */
function PhoneCodeForm({ defaultCountry }: { defaultCountry: string }) {
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
