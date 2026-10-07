"use client";

import { useState, useTransition } from "react";
import { setPassword } from "@/app/actions/profile";

/**
 * Lets a patient set the password they sign in with alongside their email. `askCurrent` is false
 * right after signing in, so patients the clinic registered (who never had one) can set it.
 */
export default function PasswordSettings({ askCurrent, hasEmail }: { askCurrent: boolean; hasEmail: boolean }) {
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();

  // onSubmit rather than <form action> so a failed save doesn't reset what was typed.
  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    startSaving(async () => {
      const result = await setPassword(formData);
      if (result.ok) {
        form.reset();
        setMessage({ type: "success", text: "Password saved. You can now sign in with your email and this password." });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  };

  return (
    <form onSubmit={save}>
      <section className="card details-card password-card">
        <div className="details-head">
          <h3>Sign-in Password</h3>
        </div>
        <p className="form-note">
          {hasEmail
            ? "Set a password to sign in with your email. You can still sign in with a code texted to your phone."
            : "Add your email address above, then set a password to sign in with it."}
        </p>
        <div className="details-grid">
          {askCurrent && (
            <div className="full-row">
              <div className="detail-row">
                <label className="detail-label" htmlFor="f-currentPassword">
                  Current Password:
                </label>
                <input id="f-currentPassword" name="currentPassword" type="password" autoComplete="current-password" className="detail-input" />
              </div>
            </div>
          )}
          <div className="detail-row">
            <label className="detail-label" htmlFor="f-password">
              New Password:
            </label>
            <input id="f-password" name="password" type="password" autoComplete="new-password" minLength={8} required className="detail-input" />
          </div>
          <div className="detail-row">
            <label className="detail-label" htmlFor="f-confirmPassword">
              Confirm Password:
            </label>
            <input id="f-confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required className="detail-input" />
          </div>
        </div>
        {askCurrent && (
          <p className="form-note">Never set a password? Sign out and back in with your phone, and you won&apos;t need the current one.</p>
        )}
        {message && <p className={`settings-message ${message.type}`}>{message.text}</p>}
      </section>
      <div className="settings-actions">
        <button type="submit" className="btn btn-primary btn-save" disabled={saving || !hasEmail}>
          {saving ? "Saving..." : "Save Password"}
        </button>
      </div>
    </form>
  );
}
