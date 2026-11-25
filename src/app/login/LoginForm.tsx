"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type LoginState, login } from "@/app/actions/auth";
import { useDictionary } from "@/components/i18n/LocaleProvider";

/** Doctors and staff sign in with their password and one box for their email or phone number. */
export default function LoginForm({ defaultCountry }: { defaultCountry: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {
    error: null,
    method: "email",
    identifier: "",
    country: defaultCountry,
  });
  const d = useDictionary();

  return (
    <>
      <form action={action} className="login-form">
        <label className="field">
          <span>{d.login.emailOrPhone}</span>
          <input
            name="identifier"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={d.login.emailOrPhonePlaceholder}
            defaultValue={state.identifier}
            required
            autoFocus
          />
          <small className="form-note">{d.login.emailOrPhoneNote}</small>
        </label>
        <label className="field">
          <span>{d.login.password}</span>
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        <Link href="/reset-password" className="forgot-link">
          {d.login.forgotPassword}
        </Link>
        {state.error && <p className="form-error">{state.error}</p>}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? d.login.signingIn : d.login.signIn}
        </button>
      </form>
      <p className="login-alt">
        {d.login.noAccount} <Link href="/signup">{d.login.createOne}</Link>
      </p>
    </>
  );
}
