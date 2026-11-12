"use client";

import { useState } from "react";
import { saveMalariaTipSettings, sendMalariaMessage } from "@/app/actions/malaria";
import useServerAction from "@/components/ui/useServerAction";
import { PREVENTION_TIPS, SL_DISTRICTS } from "@/lib/malaria/screening";

/** An admin sends a malaria prevention message now, in the app and/or by SMS. */
export function CampaignForm() {
  const { busy, error, submitWith } = useServerAction();
  const [body, setBody] = useState("");
  const [sent, setSent] = useState<number | null>(null);
  const [key, setKey] = useState(0);

  return (
    <section className="card my-invoice">
      <h3 className="details-subhead">Send a prevention message</h3>
      <form
        key={key}
        className="form-grid"
        onSubmit={submitWith(sendMalariaMessage, {
          confirm: "Send this message to the patients now?",
          onSuccess: (r) => {
            setSent((r as { recipients?: number }).recipients ?? 0);
            setBody("");
            setKey((k) => k + 1);
          },
        })}
      >
        <label className="field full">
          <span>Start from a tip</span>
          <select defaultValue="" onChange={(e) => e.target.value && setBody(e.target.value)}>
            <option value="">Choose a tip, or write your own below</option>
            {PREVENTION_TIPS.map((t) => (
              <option key={t} value={t}>
                {t.length > 90 ? `${t.slice(0, 90)}…` : t}
              </option>
            ))}
          </select>
        </label>
        <label className="field full">
          <span>Message * ({body.length}/300)</span>
          <textarea name="body" rows={3} maxLength={300} required value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <label className="field">
          <span>Patients</span>
          <select name="district" defaultValue="">
            <option value="">All patients</option>
            {SL_DISTRICTS.map((d) => (
              <option key={d} value={d}>
                In {d}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Send</span>
          <label className="checkbox-line">
            <input type="checkbox" name="inApp" defaultChecked /> <span>In the app</span>
          </label>
          <label className="checkbox-line">
            <input type="checkbox" name="sms" /> <span>By SMS (patients who allow texts)</span>
          </label>
        </div>
        {sent !== null && (
          <p className="form-note full">
            <i className="fa-solid fa-circle-check" /> Sent to {sent} patient{sent === 1 ? "" : "s"}.
          </p>
        )}
        {error && <p className="form-error full">{error}</p>}
        <div className="modal-actions full">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Sending..." : "Send now"}
          </button>
        </div>
      </form>
    </section>
  );
}

/** Whether Omega sends the tip of the week every Monday, and how. */
export function WeeklyTipSettings({ inApp, sms }: { inApp: boolean; sms: boolean }) {
  const { busy, error, submitWith } = useServerAction();
  const [saved, setSaved] = useState(false);
  return (
    <section className="card my-invoice">
      <h3 className="details-subhead">Weekly tip from Omega</h3>
      <p className="section-sub">Every Monday morning, all patients get the tip of the week.</p>
      <form className="form-grid" onSubmit={submitWith(saveMalariaTipSettings, { onSuccess: () => setSaved(true) })} onChange={() => setSaved(false)}>
        <div className="field full">
          <label className="checkbox-line">
            <input type="checkbox" name="inApp" defaultChecked={inApp} /> <span>In the app (free)</span>
          </label>
          <label className="checkbox-line">
            <input type="checkbox" name="sms" defaultChecked={sms} /> <span>By SMS, to patients who allow texts (each text costs money)</span>
          </label>
        </div>
        {saved && <p className="form-note full">Saved.</p>}
        {error && <p className="form-error full">{error}</p>}
        <div className="modal-actions full">
          <button type="submit" className="btn btn-outline" disabled={busy}>
            Save
          </button>
        </div>
      </form>
    </section>
  );
}
