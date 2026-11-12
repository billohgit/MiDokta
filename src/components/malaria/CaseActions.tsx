"use client";

import { useState } from "react";
import type { MalariaCaseStatus } from "@prisma/client";
import { addMalariaNote, approveMalariaPlan, cancelMalariaCase, closeMalariaCase, recordMalariaTest, saveMalariaPlan } from "@/app/actions/malaria";
import useServerAction from "@/components/ui/useServerAction";
import { PLAN_TEMPLATES } from "@/lib/malaria/screening";

type Props = {
  caseId: string;
  status: MalariaCaseStatus;
  isDoctor: boolean;
  testedAtDefault: string;
  plan: { text: string; days: number; dosesPerDay: number; approved: boolean } | null;
};

const SPECIES = ["P. falciparum", "P. malariae", "P. ovale", "P. vivax", "Mixed", "Not determined"];

/** What a doctor or nurse can do next on an open case. */
export default function CaseActions({ caseId, status, isDoctor, testedAtDefault, plan }: Props) {
  return (
    <div className="malaria-actions">
      {status === "REFERRED" && <TestForm caseId={caseId} testedAtDefault={testedAtDefault} />}
      {status === "POSITIVE" && <PlanForm caseId={caseId} isDoctor={isDoctor} plan={plan} />}
      {(status === "TREATMENT" || status === "INCOMPLETE") && <CloseForm caseId={caseId} />}
      <NoteForm caseId={caseId} />
      <CancelForm caseId={caseId} />
    </div>
  );
}

function TestForm({ caseId, testedAtDefault }: { caseId: string; testedAtDefault: string }) {
  const { busy, error, submitWith } = useServerAction();
  const [result, setResult] = useState("");
  return (
    <section className="card my-invoice">
      <h3 className="details-subhead">Record the test result</h3>
      <form className="form-grid" onSubmit={submitWith(recordMalariaTest)}>
        <input type="hidden" name="caseId" value={caseId} />
        <label className="field">
          <span>Test *</span>
          <select name="testType" defaultValue="RDT" required>
            <option value="RDT">Rapid diagnostic test (RDT)</option>
            <option value="MICROSCOPY">Microscopy (blood smear)</option>
          </select>
        </label>
        <label className="field">
          <span>Result *</span>
          <select name="result" required value={result} onChange={(e) => setResult(e.target.value)}>
            <option value="">Choose</option>
            <option value="POSITIVE">Positive</option>
            <option value="NEGATIVE">Negative</option>
          </select>
        </label>
        {result === "POSITIVE" && (
          <label className="field">
            <span>Species</span>
            <select name="species" defaultValue="P. falciparum">
              {SPECIES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>Where it was tested</span>
          <input name="testedAt" defaultValue={testedAtDefault} maxLength={120} />
        </label>
        <label className="field full">
          <span>Note</span>
          <input name="note" maxLength={500} placeholder="e.g. temperature 38.9 °C" />
        </label>
        {error && <p className="form-error full">{error}</p>}
        <div className="modal-actions full">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving..." : "Save result"}
          </button>
        </div>
      </form>
    </section>
  );
}

function PlanForm({ caseId, isDoctor, plan }: { caseId: string; isDoctor: boolean; plan: Props["plan"] }) {
  const save = useServerAction();
  const approve = useServerAction();
  const [text, setText] = useState(plan?.text ?? "");
  const [days, setDays] = useState(String(plan?.days ?? 3));
  const [perDay, setPerDay] = useState(String(plan?.dosesPerDay ?? 2));
  const drafted = plan && !plan.approved;

  return (
    <section className="card my-invoice">
      <h3 className="details-subhead">Treatment plan</h3>
      {drafted && (
        <div className="malaria-draft">
          <p>
            <strong>Draft waiting for a doctor&apos;s approval:</strong> {plan.text} ({plan.days} days, {plan.dosesPerDay}× a day)
          </p>
          {isDoctor ? (
            <button className="btn btn-primary" disabled={approve.busy} onClick={() => approve.run(() => approveMalariaPlan(caseId))}>
              <i className="fa-solid fa-signature btn-icon" /> Approve and start treatment
            </button>
          ) : (
            <p className="form-note">A doctor has been asked to approve it. You can still change it below.</p>
          )}
          {approve.error && <p className="form-error">{approve.error}</p>}
        </div>
      )}
      <form className="form-grid" onSubmit={save.submitWith(saveMalariaPlan)}>
        <input type="hidden" name="caseId" value={caseId} />
        <div className="field full">
          <span>Start from</span>
          <div className="malaria-options">
            {PLAN_TEMPLATES.map((t) => (
              <button
                key={t.label}
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => {
                  setText(t.text);
                  setDays(String(t.days));
                  setPerDay(String(t.dosesPerDay));
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <label className="field full">
          <span>Plan: medicine, dose and instructions *</span>
          <textarea name="planText" rows={3} maxLength={1000} required value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label className="field">
          <span>Days *</span>
          <input name="days" type="number" min={1} max={14} required value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
        <label className="field">
          <span>Times a day *</span>
          <input name="dosesPerDay" type="number" min={1} max={4} required value={perDay} onChange={(e) => setPerDay(e.target.value)} />
        </label>
        <p className="form-note full">
          {isDoctor ? "Saving approves the plan: the patient gets it straight away, with daily reminders." : "Only a doctor can approve a plan. Saving sends your draft to the doctors."}
        </p>
        {save.error && <p className="form-error full">{save.error}</p>}
        <div className="modal-actions full">
          <button type="submit" className="btn btn-primary" disabled={save.busy}>
            {save.busy ? "Saving..." : isDoctor ? "Approve plan and start treatment" : drafted ? "Update draft" : "Send draft for approval"}
          </button>
        </div>
      </form>
    </section>
  );
}

function CloseForm({ caseId }: { caseId: string }) {
  const { busy, error, submitWith } = useServerAction();
  return (
    <section className="card my-invoice">
      <h3 className="details-subhead">Record how the treatment ended</h3>
      <form className="form-grid" onSubmit={submitWith(closeMalariaCase)}>
        <input type="hidden" name="caseId" value={caseId} />
        <label className="field">
          <span>Outcome *</span>
          <select name="outcome" required defaultValue="">
            <option value="">Choose</option>
            <option value="COMPLETED">Completed treatment, recovered</option>
            <option value="NOT_COMPLETED">Did not complete / referred on</option>
          </select>
        </label>
        <label className="field">
          <span>Note *</span>
          <input name="note" maxLength={500} required placeholder="e.g. called the patient: finished all 6 doses, no fever" />
        </label>
        {error && <p className="form-error full">{error}</p>}
        <div className="modal-actions full">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Close case
          </button>
        </div>
      </form>
    </section>
  );
}

function NoteForm({ caseId }: { caseId: string }) {
  const { busy, error, submitWith } = useServerAction();
  const [key, setKey] = useState(0);
  return (
    <section className="card my-invoice">
      <h3 className="details-subhead">Add a note</h3>
      <form key={key} className="form-grid" onSubmit={submitWith(addMalariaNote, { onSuccess: () => setKey((k) => k + 1) })}>
        <input type="hidden" name="caseId" value={caseId} />
        <label className="field full">
          <span>Note *</span>
          <input name="note" maxLength={1000} required placeholder="e.g. called: going to the clinic this afternoon" />
        </label>
        <label className="checkbox-line full">
          <input type="checkbox" name="contact" />
          <span>This was a call or visit with the patient</span>
        </label>
        {error && <p className="form-error full">{error}</p>}
        <div className="modal-actions full">
          <button type="submit" className="btn btn-outline" disabled={busy}>
            Add note
          </button>
        </div>
      </form>
    </section>
  );
}

function CancelForm({ caseId }: { caseId: string }) {
  const { busy, error, submitWith } = useServerAction();
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="btn btn-sm btn-outline malaria-cancel" onClick={() => setOpen(true)}>
        Cancel this case
      </button>
    );
  return (
    <section className="card my-invoice">
      <form className="form-grid" onSubmit={submitWith(cancelMalariaCase)}>
        <input type="hidden" name="caseId" value={caseId} />
        <label className="field full">
          <span>Why cancel? *</span>
          <input name="reason" maxLength={500} required placeholder="e.g. opened by mistake, duplicate" />
        </label>
        {error && <p className="form-error full">{error}</p>}
        <div className="modal-actions full">
          <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
            Keep it
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Cancel case
          </button>
        </div>
      </form>
    </section>
  );
}
