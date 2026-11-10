"use client";

import { useState, useTransition } from "react";
import { setMainIllness } from "@/app/actions/profile";
import { CONDITIONS } from "@/lib/conditions";

/** The patient's main illness, for doctor and medicine suggestions. Optional. */
export default function MainIllnessSettings({ current }: { current: string | null }) {
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [saving, start] = useTransition();

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    start(async () => {
      const r = await setMainIllness(formData);
      setMessage(
        r.ok
          ? { type: "success", text: formData.get("mainIllness") ? "Saved. Your suggestions are on your Home page." : "Cleared." }
          : { type: "error", text: r.error },
      );
    });
  };

  return (
    <form onSubmit={save} id="main-illness">
      <section className="card details-card">
        <div className="details-head">
          <h3>Main Health Concern</h3>
        </div>
        <p className="form-note">
          Optional. Tell us the illness you mainly need help with, and we&apos;ll suggest doctors and medicines for it on your Home page. Not
          sure what it is? Leave it blank.
        </p>
        <div className="details-grid">
          <div className="full-row">
            <div className="detail-row">
              <label className="detail-label" htmlFor="f-mainIllness">
                Main illness:
              </label>
              <input
                id="f-mainIllness"
                name="mainIllness"
                list="common-illnesses"
                maxLength={120}
                defaultValue={current ?? ""}
                placeholder="e.g. Malaria, high blood pressure, diabetes"
                className="detail-input"
              />
              <datalist id="common-illnesses">
                {CONDITIONS.map((c) => (
                  <option key={c.name} value={c.name} />
                ))}
              </datalist>
            </div>
          </div>
        </div>
        {message && <p className={`settings-message ${message.type}`}>{message.text}</p>}
      </section>
      <div className="settings-actions">
        <button type="submit" className="btn btn-primary btn-save" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
