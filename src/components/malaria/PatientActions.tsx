"use client";

import { reportMalariaOutcome, takeMalariaDose } from "@/app/actions/malaria";
import useServerAction from "@/components/ui/useServerAction";
import { MALARIA_CHECK_EVENT } from "@/components/omega/events";

/** Opens Omega on the malaria check. */
export function StartCheckButton({ label = "Start a malaria check" }: { label?: string }) {
  return (
    <button type="button" className="btn btn-primary" onClick={() => window.dispatchEvent(new Event(MALARIA_CHECK_EVENT))}>
      <i className="fa-solid fa-mosquito btn-icon" /> {label}
    </button>
  );
}

export function TakeDoseButton({ caseId, day, days }: { caseId: string; day: number; days: number }) {
  const { busy, error, run } = useServerAction();
  return (
    <>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => takeMalariaDose(caseId))}>
        <i className="fa-solid fa-check btn-icon" /> I took today&apos;s medicine (day {day} of {days})
      </button>
      {error && <p className="form-error">{error}</p>}
    </>
  );
}

export function OutcomeQuestion({ caseId }: { caseId: string }) {
  const { busy, error, run } = useServerAction();
  const answer = (o: "BETTER" | "STILL_SICK" | "NOT_FINISHED") => run(() => reportMalariaOutcome(caseId, o));
  return (
    <div className="malaria-outcome">
      <p>
        <strong>Did you finish all your malaria medicine, and how do you feel?</strong>
      </p>
      <div className="malaria-outcome-buttons">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => answer("BETTER")}>
          I finished it and feel better
        </button>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => answer("STILL_SICK")}>
          I finished it but I&apos;m still unwell
        </button>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => answer("NOT_FINISHED")}>
          I didn&apos;t finish it
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
