"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { type LoginMethod, type ResetState, passwordReset } from "@/app/actions/auth";
import PhoneInput from "@/components/ui/PhoneInput";

/** Forgot password: find the account by email or phone, get a texted code, choose a new password. */
export default function ResetPasswordForm({ defaultCountry }: { defaultCountry: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(passwordReset, {
    step: "request",
    error: null,
    notice: null,
    method: "email",
    identifier: "",
    country: defaultCountry,
  });
  const [method, setMethod] = useState<LoginMethod>(state.method);
  const [country, setCountry] = useState(state.country);
  const resetting = state.step === "reset";

  return (
    <>
      <form action={action} className="login-form">
        {!resetting && (
          <>
            <p className="login-sub">Enter the email or phone number on your account. We&apos;ll text a code to the phone number we have for you.</p>
            <div className="segmented login-method" role="tablist" aria-label="Find my account by">
              {(["email", "phone"] as const).map((m) => (
                <button key={m} type="button" role="tab" aria-selected={method === m} className={method === m ? "on" : undefined} onClick={() => setMethod(m)}>
                  <i className={m === "email" ? "fa-regular fa-envelope" : "fa-solid fa-phone"} /> {m === "email" ? "Email" : "Phone"}
                </button>
              ))}
            </div>
          </>
        )}
        <input type="hidden" name="method" value={method} />
        {resetting ? (
          <>
            {/* The account being reset travels with the form. */}
            <input type="hidden" name="identifier" value={state.identifier} />
            <input type="hidden" name="country" value={state.country} />
          </>
        ) : method === "email" ? (
          <label className="field" key="email">
            <span>Email</span>
            <input type="email" name="identifier" autoComplete="email" defaultValue={state.method === "email" ? state.identifier : ""} required autoFocus />
          </label>
        ) : (
          <div className="field" key="phone">
            <label htmlFor="reset-phone">Phone number</label>
            <PhoneInput id="reset-phone" name="identifier" country={country} onCountryChange={setCountry} defaultValue={state.method === "phone" ? state.identifier : ""} required autoFocus />
          </div>
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
