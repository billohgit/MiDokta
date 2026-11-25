"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type ResetState, passwordReset } from "@/app/actions/auth";

/** Forgot password: find the account by email or phone (one box), get a texted code, choose a new password. */
export default function ResetPasswordForm({ defaultCountry }: { defaultCountry: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(passwordReset, {
    step: "request",
    error: null,
    notice: null,
    method: "email",
    identifier: "",
    country: defaultCountry,
  });
  const resetting = state.step === "reset";

  return (
    <>
      <form action={action} className="login-form">
        {!resetting && <p className="login-sub">Enter the email or phone number on your account. We&apos;ll text a code to the phone number we have for you.</p>}
        {resetting ? (
          // The account being reset travels with the form.
          <input type="hidden" name="identifier" value={state.identifier} />
        ) : (
          <label className="field">
            <span>Email or phone number</span>
            <input name="identifier" autoComplete="username" defaultValue={state.identifier} placeholder="you@example.com or 076 123 456" required autoFocus />
          </label>
        )}

        {state.notice && <p className="form-note">{state.notice}</p>}

        {resetting && (
          <>
            <label className="field">
              <span>6-digit code</span>
              <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
            </label>
            <label className="field">
              <span>New password</span>
              <input type="password" name="password" autoComplete="new-password" minLength={8} required />
            </label>
            <label className="field">
              <span>Confirm new password</span>
              <input type="password" name="confirm" autoComplete="new-password" minLength={8} required />
            </label>
          </>
        )}

        {state.error && <p className="form-error">{state.error}</p>}
        <button type="submit" name="intent" value={resetting ? "reset" : "send"} className="btn btn-primary" disabled={pending}>
          {pending ? "Please wait..." : resetting ? "Set new password" : "Text me a code"}
        </button>
        {resetting && (
          <p className="login-alt">
            No code?{" "}
            <button type="submit" name="intent" value="resend" className="link-btn" formNoValidate disabled={pending}>
              Send another
            </button>
          </p>
        )}
      </form>
      <p className="login-alt">
        Remembered it? <Link href="/login?as=staff">Back to sign in</Link>
      </p>
    </>
  );
}
