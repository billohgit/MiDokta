"use client";

import { useRouter } from "next/navigation";
import { startCall } from "@/app/actions/calls";
import useServerAction from "@/components/ui/useServerAction";

type Props = {
  calleeId: string;
  name: string;
  /** The portal root, e.g. "/doctor"; the call screen lives at `${basePath}/calls/<id>`. */
  basePath: string;
  appointmentId?: string;
  label?: string;
  /** Icon-and-label pill for tight headers (the chat), instead of a full button. */
  compact?: boolean;
};

/** Rings the other person in the app and opens the call screen. */
export default function CallButton({ calleeId, name, basePath, appointmentId, label = "Video call", compact }: Props) {
  const router = useRouter();
  const { busy, error, run } = useServerAction();

  return (
    <>
      {error && <small className={`form-error${compact ? " chat-call-error" : ""}`}>{error}</small>}
      <button
        type="button"
        className={`btn btn-sm btn-success${compact ? " chat-call-btn" : ""}`}
        disabled={busy}
        title={`Video call ${name}`}
        onClick={() => run(() => startCall(calleeId, appointmentId), { onSuccess: (r) => router.push(`${basePath}/calls/${r.id}`) })}
      >
        <i className={`fa-solid fa-video${compact ? "" : " btn-icon"}`} /> <span>{busy ? "Calling..." : label}</span>
      </button>
    </>
  );
}
