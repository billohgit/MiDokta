"use client";

import { useActionState } from "react";
import { type LoginState, login } from "@/app/actions/auth";

const initial: LoginState = { error: null, email: "" };

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);

  return (
    <form action={action} className="login-form">
      <label className="field">
        <span>Email</span>
        <input type="email" name="email" autoComplete="email" defaultValue={state.email} required autoFocus />
      </label>
      <label className="field">
        <span>Password</span>
        <input type="password" name="password" autoComplete="current-password" required />
      </label>
      {state.error && <p className="form-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
