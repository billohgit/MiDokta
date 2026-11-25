"use client";

import Link from "next/link";
import { type FormEvent, startTransition, useActionState, useState } from "react";
import { type LoginState, type PatientLoginState, login, patientLogin } from "@/app/actions/auth";
import { useDictionary } from "@/components/i18n/LocaleProvider";

/**
 * Patients type their phone number or their email in one box. A phone number gets a texted code;
 * an email (anything with an @) signs in with the password.
 */
export default function PatientLoginForm({ defaultCountry }: { defaultCountry: string }) {
  const d = useDictionary();
  return (
    <>
      <PatientSignIn defaultCountry={defaultCountry} />
      <p className="login-alt">
        {d.login.noAccount} <Link href="/signup">{d.login.createOne}</Link>
      </p>
    </>
  );
}

/** Phone: number, then the texted code, then (shared numbers) who is signing in. Email: password. */
function PatientSignIn({ defaultCountry }: { defaultCountry: string }) {
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
  const [emailState, emailAction, emailPending] = useActionState<LoginState, FormData>(login, {
    error: null,
    method: "email",
    identifier: "",
    country: "",
  });
  const [typed, setTyped] = useState(state.identifier);
  const [used, setUsed] = useState<"phone" | "email">("phone");
  const d = useDictionary();
  const isEmail = typed.includes("@");
  const busy = pending || emailPending;
  const error = used === "email" ? emailState.error : state.error;

  // One form: the box keeps its focus while the patient types, whichever way they sign in.
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setUsed(isEmail ? "email" : "phone");
    startTransition(() => (isEmail ? emailAction(formData) : action(formData)));
  };

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
    <form onSubmit={submit} className="login-form">
      <input type="hidden" name="intent" value="send" />
      <label className="field">
        <span>{d.login.emailOrPhone}</span>
        <input
          name="identifier"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={d.login.emailOrPhonePlaceholder}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          required
          autoFocus
        />
        <small className="form-note">
          {d.login.patientPhoneNote} {d.login.emailOrPhoneNote}
        </small>
      </label>
      {isEmail && (
        <label className="field">
          <span>{d.login.password}</span>
          <input type="password" name="password" autoComplete="current-password" required />
          <small className="form-note">{d.login.noPasswordYet}</small>
        </label>
      )}
      {error && <p className="form-error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {isEmail ? (emailPending ? d.login.signingIn : d.login.signIn) : pending ? d.login.sending : d.login.textMeCode}
      </button>
      {isEmail && (
        <Link href="/reset-password" className="forgot-link">
          {d.login.forgotPassword}
        </Link>
      )}
    </form>
  );
}
