"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { type LoginState, type PatientLoginState, login, patientLogin } from "@/app/actions/auth";
import PhoneInput from "@/components/ui/PhoneInput";
import { useDictionary } from "@/components/i18n/LocaleProvider";

type Method = "phone" | "email";

/** Patients sign in with a code texted to their phone, or with their email and password. */
export default function PatientLoginForm({ defaultCountry }: { defaultCountry: string }) {
  const [method, setMethod] = useState<Method>("phone");
  const d = useDictionary();

  return (
    <>
      <div className="segmented login-method" role="tablist" aria-label={d.login.signInWith}>
        {(["phone", "email"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={method === m} className={method === m ? "on" : undefined} onClick={() => setMethod(m)}>
            <i className={m === "email" ? "fa-regular fa-envelope" : "fa-solid fa-phone"} /> {m === "email" ? d.login.email : d.login.phone}
          </button>
        ))}
      </div>
      {method === "phone" ? <PhoneCodeForm defaultCountry={defaultCountry} /> : <EmailPasswordForm />}
      <p className="login-alt">
        {d.login.noAccount} <Link href="/signup">{d.login.createOne}</Link>
      </p>
    </>
  );
}

function EmailPasswordForm() {
  const d = useDictionary();
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
        <span>{d.login.email}</span>
        <input type="email" name="identifier" autoComplete="email" defaultValue={state.identifier} required autoFocus />
      </label>
      <label className="field">
        <span>{d.login.password}</span>
        <input type="password" name="password" autoComplete="current-password" required />
        <small className="form-note">{d.login.noPasswordYet}</small>
      </label>
      {state.error && <p className="form-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? d.login.signingIn : d.login.signIn}
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
  const d = useDictionary();

  if (state.step === "choose") {
    return (
      <form action={action} className="login-form">
        <p className="login-step-text">{d.login.sharedNumber}</p>
        <div className="login-choices">
          {state.choices.map((c) => (
            <button key={c.id} type="submit" name="userId" value={c.id} className="btn btn-outline" disabled={pending}>
              <i className="fa-regular fa-user btn-icon" /> {c.name}
            </button>
          ))}
        </div>
        {state.error && <p className="form-error">{state.error}</p>}
        <button type="submit" name="intent" value="back" className="link-btn" formNoValidate>
          {d.login.differentNumber}
        </button>
      </form>
    );
  }

  if (state.step === "code") {
    return (
      <form action={action} className="login-form">
        <p className="login-step-text">
          {state.notice ?? d.login.enterCode} <strong>{state.phone}</strong>
        </p>
        <label className="field">
          <span>{d.login.code}</span>
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
          {pending ? d.login.checking : d.login.signIn}
        </button>
        <div className="login-links">
          <button type="submit" name="intent" value="resend" className="link-btn" formNoValidate disabled={pending}>
            {d.login.newCode}
          </button>
          <button type="submit" name="intent" value="back" className="link-btn" formNoValidate disabled={pending}>
            {d.login.changeNumber}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={action} className="login-form">
      <input type="hidden" name="intent" value="send" />
      <div className="field">
        <label htmlFor="patient-phone">{d.login.phoneNumber}</label>
        <PhoneInput
          id="patient-phone"
          name="identifier"
          country={country}
          onCountryChange={setCountry}
          defaultValue={state.identifier}
          required
          autoFocus
        />
        <small className="form-note">{d.login.clinicNumber}</small>
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? d.login.sending : d.login.textMeCode}
      </button>
    </form>
  );
}
