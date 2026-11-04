"use client";

import { useState } from "react";
import type { TestKind, TestStatus } from "@prisma/client";
import { updateTestAction } from "@/app/actions/followups";
import useServerAction from "@/components/ui/useServerAction";

type Props = {
  id: string;
  status: TestStatus;
  kind: TestKind;
  abnormal: boolean;
  /** Nurses, doctors and admins record collection and results. */
  canEnter: boolean;
  /** The ordering doctor (or an admin) reviews and cancels. */
  canReview: boolean;
  /** Telling the patient: the ordering doctor, a nurse or an admin. */
  canTell: boolean;
};

type Step = "result" | "review" | "communicate" | "cancel" | null;

/** The next step on a test, for whoever may take it. */
export default function TestActions({ id, status, kind, abnormal, canEnter, canReview, canTell }: Props) {
  const [open, setOpen] = useState<Step>(null);
  const { busy, error, run, submitWith } = useServerAction();
  const act = (action: Exclude<Step, null> | "collect") => submitWith((fd: FormData) => updateTestAction(id, action, fd), { onSuccess: () => setOpen(null) });

  if (status === "COMMUNICATED" || status === "CANCELLED") return null;

  return (
    <div className="my-invoice-pay">
      {!open && (
        <div className="row-actions">
          {status === "ORDERED" && canEnter && (
            <button className="btn btn-outline" disabled={busy} onClick={() => run(() => updateTestAction(id, "collect", new FormData()))}>
              {kind === "LAB" ? "Sample collected" : "Done, waiting for report"}
            </button>
          )}
          {(status === "ORDERED" || status === "COLLECTED") && canEnter && (
            <button className="btn btn-primary" onClick={() => setOpen("result")}>
              Enter result
            </button>
          )}
          {status === "RESULTED" && canReview && (
            <button className="btn btn-primary" onClick={() => setOpen("review")}>
              Review result
            </button>
          )}
          {status === "REVIEWED" && canTell && (
            <button className="btn btn-primary" onClick={() => setOpen("communicate")}>
              Tell the patient
            </button>
          )}
          {canReview && (
            <button className="btn btn-outline" onClick={() => setOpen("cancel")}>
              Cancel test
            </button>
          )}
          {status === "RESULTED" && !canReview && <p className="form-note">Waiting for the ordering doctor to review the result.</p>}
        </div>
      )}

      {open === "result" && (
        <form className="form-grid" onSubmit={act("result")}>
          <label className="field full">
            <span>Result *</span>
            <textarea name="result" rows={4} maxLength={4000} required placeholder="Values, findings or the report's conclusion" />
          </label>
          <label className="checkbox-line full">
            <input type="checkbox" name="abnormal" /> Abnormal: flag it for the doctor
          </label>
          <Buttons busy={busy} label="Save result" onCancel={() => setOpen(null)} />
        </form>
      )}
      {open === "review" && (
        <form className="form-grid" onSubmit={act("review")}>
          <label className="field full">
            <span>Your assessment</span>
            <textarea name="reviewNote" rows={3} maxLength={1000} placeholder="e.g. Normal, no action. / Start treatment; see in 2 weeks." />
          </label>
          <label className="checkbox-line full">
            <input type="checkbox" name="abnormal" defaultChecked={abnormal} /> Abnormal: the patient should talk to us about it
          </label>
          <Buttons busy={busy} label="Save review" onCancel={() => setOpen(null)} />
        </form>
      )}
      {open === "communicate" && (
        <form className="form-grid" onSubmit={act("communicate")}>
          <p className="form-note full">
            The patient gets a text saying their result is ready{abnormal ? " and asking them to contact the clinic" : ""}, and can read it in their
            records. The result itself is never sent by text.
          </p>
          <label className="field full">
            <span>How else did you tell them? (optional)</span>
            <input name="how" maxLength={200} placeholder="e.g. Phoned the patient, explained the treatment" />
          </label>
          <Buttons busy={busy} label="Tell the patient" onCancel={() => setOpen(null)} />
        </form>
      )}
      {open === "cancel" && (
        <form className="form-grid" onSubmit={act("cancel")}>
          <label className="field full">
            <span>Why is it cancelled? *</span>
            <input name="reason" maxLength={300} required placeholder="e.g. Ordered by mistake / done elsewhere" />
          </label>
          <Buttons busy={busy} label="Cancel the test" onCancel={() => setOpen(null)} />
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
