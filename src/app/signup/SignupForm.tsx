"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type SignupState, signup } from "@/app/actions/auth";
import { SIGNUP_ROLES } from "@/lib/roles";

const initial: SignupState = {
  error: null,
  done: false,
  values: { firstName: "", lastName: "", email: "", phone: "", role: "" },
};

const label = (role: string) => role.charAt(0) + role.slice(1).toLowerCase();

export default function SignupForm() {
  const [state, action, pending] = useActionState(signup, initial);
  const v = state.values;

  if (state.done) {
    return (
      <>
        <h1>Account created</h1>
        <p className="login-sub">
          Thanks, {v.firstName}. An administrator needs to approve your account before you can sign in. You&apos;ll be
          able to sign in with {v.email} once it&apos;s activated.
        </p>
        <Link href="/login" className="btn btn-primary login-btn">
          Back to Sign In
        </Link>
      </>
    );
  }

  return (
    <>
      <h1>Create an account</h1>
      <p className="login-sub">An administrator will approve it before you can sign in</p>
      <form action={action} className="login-form">
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
        <label className="field">
          <span>Phone (optional)</span>
          <input type="tel" name="phone" autoComplete="tel" defaultValue={v.phone} />
        </label>
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
        <label className="field">
          <span>Password</span>
          <input type="password" name="password" autoComplete="new-password" minLength={8} required />
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input type="password" name="confirmPassword" autoComplete="new-password" minLength={8} required />
        </label>
        {state.error && <p className="form-error">{state.error}</p>}
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
