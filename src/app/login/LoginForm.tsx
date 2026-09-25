"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { type LoginMethod, type LoginState, login } from "@/app/actions/auth";
import PhoneInput from "@/components/ui/PhoneInput";

export default function LoginForm({ defaultCountry }: { defaultCountry: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {
    error: null,
    method: "email",
    identifier: "",
    country: defaultCountry,
  });
  const [method, setMethod] = useState<LoginMethod>(state.method);
  const [country, setCountry] = useState(state.country);
  // Only prefill the identifier the server echoed back for the method it was typed in.
  const prefill = state.method === method ? state.identifier : "";

  return (
    <>
      <form action={action} className="login-form">
        <div className="segmented login-method" role="tablist" aria-label="Sign in with">
          {(["email", "phone"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={method === m}
              className={method === m ? "on" : undefined}
              onClick={() => setMethod(m)}
            >
              <i className={m === "email" ? "fa-regular fa-envelope" : "fa-solid fa-phone"} />{" "}
              {m === "email" ? "Email" : "Phone"}
            </button>
          ))}
        </div>
        <input type="hidden" name="method" value={method} />
        {method === "email" ? (
          <label className="field" key="email">
            <span>Email</span>
            <input type="email" name="identifier" autoComplete="email" defaultValue={prefill} required autoFocus />
          </label>
        ) : (
          <div className="field" key="phone">
            <label htmlFor="login-phone">Phone number</label>
            <PhoneInput
              id="login-phone"
              name="identifier"
              country={country}
              onCountryChange={setCountry}
              defaultValue={prefill}
              required
              autoFocus
            />
          </div>
        )}
        <label className="field">
          <span>Password</span>
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        {state.error && <p className="form-error">{state.error}</p>}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Signing in..." : "Sign In"}
        </button>
      </form>
      <p className="login-alt">
        Don&apos;t have an account? <Link href="/signup">Create one</Link>
      </p>
    </>
  );
}
