"use client";

import { useRouter } from "next/navigation";
import { startInstantVideoCall } from "@/app/actions/video";
import useServerAction from "@/components/ui/useServerAction";

/** Chat header button: starts a video visit with the patient now. */
export default function ChatCallButton({ patientId, name }: { patientId: string; name: string }) {
  const router = useRouter();
  const { busy, error, run } = useServerAction();

  return (
    <>
      {error && <small className="form-error chat-call-error">{error}</small>}
      <button
        type="button"
        className="btn btn-sm btn-success chat-call-btn"
        disabled={busy}
        title={`Video call ${name}`}
        onClick={() =>
          run(() => startInstantVideoCall(patientId), {
            confirm: `Start a video visit with ${name} now? They'll be texted a link to join, and the visit is added to your appointments.`,
            onSuccess: (r) =>
              router.push(`/doctor/appointments/${r.id}/call${(r as { texted?: boolean }).texted === false ? "?untexted=1" : ""}`),
          })
        }
      >
        <i className="fa-solid fa-video" /> <span>{busy ? "Starting..." : "Video call"}</span>
      </button>
    </>
  );
}
