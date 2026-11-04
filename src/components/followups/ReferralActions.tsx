"use client";

import { useState } from "react";
import type { ReferralStatus } from "@prisma/client";
import { updateReferralAction } from "@/app/actions/followups";
import useServerAction from "@/components/ui/useServerAction";
import type { PersonOption } from "./shared";

type Props = {
  id: string;
  status: ReferralStatus;
  /** The referring doctor (or an admin) closes the loop. */
  canClose: boolean;
  canCancel: boolean;
  navigatorId: string | null;
  navigators: PersonOption[];
  nextStep: string | null;
  nextStepDue: string;
  patientInstructions: string | null;
  appointmentAt: string;
};

type Panel = "navigate" | "schedule" | "report" | "close" | "cancel" | null;

/** Care navigation and the referral's next step, for whoever may take it. */
export default function ReferralActions(p: Props) {
  const [open, setOpen] = useState<Panel>(null);
  const { busy, error, run, submitWith } = useServerAction();
  const act = (action: Parameters<typeof updateReferralAction>[1]) =>
    submitWith((fd: FormData) => updateReferralAction(p.id, action, fd), { onSuccess: () => setOpen(null) });
  const quick = (action: Parameters<typeof updateReferralAction>[1], confirm?: string) => run(() => updateReferralAction(p.id, action, new FormData()), { confirm });

  if (p.status === "CLOSED" || p.status === "CANCELLED") return null;

  return (
    <div className="my-invoice-pay">
      {!open && (
        <>
          <div className="row-actions">
            {(p.status === "CREATED" || p.status === "SCHEDULED") && (
              <button className="btn btn-primary" onClick={() => setOpen("schedule")}>
                {p.status === "CREATED" ? "Book appointment" : "Change appointment"}
              </button>
            )}
            {p.status === "SCHEDULED" && (
              <>
                <button className="btn btn-primary" disabled={busy} onClick={() => quick("attended")}>
                  Patient attended
                </button>
                <button className="btn btn-outline" disabled={busy} onClick={() => quick("missed", "Mark the appointment as missed? The referral goes back to booking a new date.")}>
                  Missed it
                </button>
              </>
            )}
            {(p.status === "SCHEDULED" || p.status === "ATTENDED") && (
              <button className="btn btn-outline" onClick={() => setOpen("report")}>
                Record specialist&apos;s report
              </button>
            )}
            {(p.status === "ATTENDED" || p.status === "REPORT_RECEIVED") && p.canClose && (
              <button className="btn btn-primary" onClick={() => setOpen("close")}>
                Close the loop
              </button>
            )}
            <button className="btn btn-outline" onClick={() => setOpen("navigate")}>
              <i className="fa-solid fa-route btn-icon" /> Care navigation
            </button>
            <button
              className="btn btn-outline"
              disabled={busy}
              onClick={() => quick("text", "Text the patient their instructions and appointment date?")}
            >
              <i className="fa-solid fa-comment-sms btn-icon" /> Text patient
            </button>
            {p.canCancel && (
              <button className="btn btn-outline" onClick={() => setOpen("cancel")}>
                Cancel referral
              </button>
            )}
          </div>
          <form className="navigator-pick" onSubmit={act("assign")}>
            <label>
              <span className="section-sub">Care navigator</span>
              <select name="navigatorId" defaultValue={p.navigatorId ?? ""} required>
                <option value="" disabled>
                  Choose...
                </option>
                {p.navigators.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} ({n.detail})
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-sm btn-outline" disabled={busy}>
              Assign
            </button>
          </form>
        </>
      )}

      {open === "navigate" && (
        <form className="form-grid" onSubmit={act("navigate")}>
          <label className="field full">
            <span>Contact with the patient (optional)</span>
            <textarea name="contact" rows={2} maxLength={1000} placeholder="e.g. Called; patient has no transport, arranged for Friday" />
          </label>
          <label className="field">
            <span>Next step</span>
            <input name="nextStep" maxLength={300} defaultValue={p.nextStep ?? ""} placeholder="e.g. Call the hospital to confirm the date" />
          </label>
          <label className="field">
            <span>By</span>
            <input name="nextStepDue" type="date" defaultValue={p.nextStepDue} />
          </label>
          <label className="field full">
            <span>Instructions for the patient</span>
            <textarea
              name="patientInstructions"
              rows={3}
              maxLength={600}
              defaultValue={p.patientInstructions ?? ""}
              placeholder="Where to go, who to ask for, what to bring (referral letter, ID, previous results)"
            />
          </label>
          <Buttons busy={busy} label="Save" onCancel={() => setOpen(null)} />
        </form>
      )}
      {open === "schedule" && (
        <form className="form-grid" onSubmit={act("schedule")}>
          <label className="field full">
            <span>Appointment date and time *</span>
            <input name="appointmentAt" type="datetime-local" defaultValue={p.appointmentAt} required />
          </label>
          <p className="form-note full">For a referral to a MiDokta doctor, this books the appointment in their schedule and the patient gets the usual reminders.</p>
          <Buttons busy={busy} label="Save appointment" onCancel={() => setOpen(null)} />
        </form>
      )}
      {open === "report" && (
        <form className="form-grid" onSubmit={act("report")}>
          <label className="field full">
            <span>What did the specialist find and recommend? *</span>
            <textarea name="reportSummary" rows={4} maxLength={4000} required />
          </label>
          <Buttons busy={busy} label="Save report" onCancel={() => setOpen(null)} />
        </form>
      )}
      {open === "close" && (
        <form className="form-grid" onSubmit={act("close")}>
          <label className="field full">
            <span>Outcome and plan *</span>
            <textarea
              name="closureNote"
              rows={4}
              maxLength={2000}
              required
              placeholder="What was found, what was done, and the plan from here (e.g. continue treatment, review in 3 months)"
            />
          </label>
          <p className="form-note full">This documents the referral&apos;s outcome and closes it for good.</p>
          <Buttons busy={busy} label="Close the loop" onCancel={() => setOpen(null)} />
        </form>
      )}
      {open === "cancel" && (
        <form className="form-grid" onSubmit={act("cancel")}>
          <label className="field full">
            <span>Why is it cancelled? *</span>
            <input name="reason" maxLength={300} required placeholder="e.g. Patient declined / no longer needed" />
          </label>
          <Buttons busy={busy} label="Cancel the referral" onCancel={() => setOpen(null)} />
        </form>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

function Buttons({ busy, label, onCancel }: { busy: boolean; label: string; onCancel: () => void }) {
  return (
    <div className="modal-actions full">
      <button type="button" className="btn btn-outline" onClick={onCancel}>
        Back
      </button>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Saving..." : label}
      </button>
    </div>
  );
}
