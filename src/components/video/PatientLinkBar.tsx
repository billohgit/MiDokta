"use client";

import { useState } from "react";
import { resendVideoLink } from "@/app/actions/video";
import useServerAction from "@/components/ui/useServerAction";

type Props = { id: string; link: string; untexted: boolean };

/** The patient's join link, with copy and re-send controls. */
export default function PatientLinkBar({ id, link, untexted }: Props) {
  const { busy, error, run } = useServerAction();
  const [note, setNote] = useState<string | null>(
    untexted ? "The patient couldn't be texted (no valid phone number, or texts turned off). Share this link with them another way." : null,
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setNote("Link copied.");
    } catch {
      setNote("Couldn't copy automatically. Select the link and copy it.");
    }
  };

  return (
    <div className="call-link">
      <label htmlFor="patient-link">Patient&apos;s join link</label>
      <div className="call-link-row">
        <input id="patient-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn btn-outline btn-sm" onClick={copy}>
          <i className="fa-regular fa-copy btn-icon" /> Copy
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={busy}
          onClick={() => run(() => resendVideoLink(id), { onSuccess: () => setNote("Link texted to the patient.") })}
        >
          <i className="fa-solid fa-comment-sms btn-icon" /> {busy ? "Sending..." : "Text it again"}
        </button>
      </div>
      {(error || note) && <small className={error ? "form-error" : "call-note"}>{error ?? note}</small>}
    </div>
  );
}
