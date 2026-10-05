"use client";

import { useRouter } from "next/navigation";
import { patientStartCall } from "@/app/actions/video";
import useServerAction from "@/components/ui/useServerAction";

/** On the patient's call page: opens the room and alerts the doctor, then reloads into the call. */
export default function PatientStartCallButton({ callKey }: { callKey: string }) {
  const router = useRouter();
  const { busy, error, run } = useServerAction();

  return (
    <div className="patient-call-start">
      <button
        type="button"
        className="btn btn-success pay-btn"
        disabled={busy}
        onClick={() => run(() => patientStartCall(callKey), { onSuccess: () => router.refresh() })}
      >
        <i className="fa-solid fa-video btn-icon" /> {busy ? "Starting..." : "Start the call"}
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
