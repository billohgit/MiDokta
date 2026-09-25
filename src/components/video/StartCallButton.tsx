"use client";

import { useRouter } from "next/navigation";
import { startVideoCall } from "@/app/actions/video";
import useServerAction from "@/components/ui/useServerAction";

/** Opens the video room (texting the patient their link the first time) and goes to the call. */
export default function StartCallButton({ id, label = "Start video call" }: { id: string; label?: string }) {
  const router = useRouter();
  const { busy, error, run } = useServerAction();

  return (
    <>
      <button
        type="button"
        className="btn btn-sm btn-success"
        disabled={busy}
        onClick={() =>
          run(() => startVideoCall(id), {
            onSuccess: (r) =>
              router.push(`/doctor/appointments/${id}/call${(r as { texted?: boolean }).texted === false ? "?untexted=1" : ""}`),
          })
        }
      >
        <i className="fa-solid fa-video btn-icon" /> {busy ? "Opening..." : label}
      </button>
      {error && <p className="form-error">{error}</p>}
    </>
  );
}
