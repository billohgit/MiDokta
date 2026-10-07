"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { answerCall, declineCall } from "@/app/actions/calls";
import Avatar from "@/components/appointments/Avatar";
import { INCOMING_POLL_MS, type IncomingCall } from "./types";
import { playRingtone, unlockAudio } from "./sounds";

/**
 * Mounted on every doctor and patient portal page: watches for a call ringing for this person and
 * shows it full screen with Answer and Decline, ringing and vibrating until they choose or it stops.
 */
export default function IncomingCallWatcher({ basePath }: { basePath: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [call, setCall] = useState<IncomingCall | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Calls the person already declined or answered here, so a slow poll doesn't bring them back.
  const handled = useRef(new Set<string>());

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const res = await fetch("/api/calls/incoming", { cache: "no-store" });
        if (!res.ok || stopped) return;
        const data: { call: IncomingCall | null } = await res.json();
        setCall(data.call && !handled.current.has(data.call.id) ? data.call : null);
      } catch {
        // Offline for a moment; try again on the next tick.
      }
    };
    load();
    const timer = setInterval(load, INCOMING_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  // Browsers only play sound after the page has been tapped once. Use that first tap to unlock audio
  // and to ask once for notifications, so calls can be announced while the tab is in the background.
  useEffect(() => {
    const onFirstTap = () => {
      unlockAudio();
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    };
    window.addEventListener("pointerdown", onFirstTap, { once: true });
    return () => window.removeEventListener("pointerdown", onFirstTap);
  }, []);

  // Already on this call's screen (it has its own Answer button): don't ring on top of it.
  const visible = call && pathname !== `${basePath}/calls/${call.id}` ? call : null;

  const ringingId = visible?.id;
  const callerName = visible?.from.name;

  // Keyed on the call's id: every poll returns a fresh object, which mustn't restart the ringing.
  useEffect(() => {
    if (!ringingId) return;
    setError(null);
    const stopRinging = playRingtone();
    const title = document.title;
    let flip = false;
    const flash = setInterval(() => {
      flip = !flip;
      document.title = flip ? `Incoming call: ${callerName}` : title;
    }, 1000);

    let note: Notification | null = null;
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      note = new Notification("Incoming video call", { body: `${callerName} is calling you`, tag: ringingId, requireInteraction: true });
      note.onclick = () => window.focus();
    }
    return () => {
      stopRinging();
      clearInterval(flash);
      document.title = title;
      note?.close();
    };
  }, [ringingId, callerName]);

  if (!visible) return null;

  const answer = async () => {
    setBusy(true);
    handled.current.add(visible.id);
    const result = await answerCall(visible.id).catch(() => ({ ok: false as const, error: "Couldn't connect. Check your connection." }));
    setBusy(false);
    if (result.ok) {
      setCall(null);
      router.push(`${basePath}/calls/${visible.id}`);
    } else {
      setError(result.error);
      setTimeout(() => setCall(null), 2500);
    }
  };

  const decline = async () => {
    handled.current.add(visible.id);
    setCall(null);
    await declineCall(visible.id).catch(() => {});
  };

  return (
    <div className="incoming-call" role="alertdialog" aria-modal="true" aria-label={`Incoming video call from ${visible.from.name}`}>
      <div className="incoming-card">
        <p className="incoming-label">
          <i className="fa-solid fa-video" /> Incoming video call
        </p>
        <div className="incoming-avatar">
          <Avatar person={visible.from} size={112} />
        </div>
        <h2>{visible.from.name}</h2>
        {error && <p className="form-error">{error}</p>}
        <div className="incoming-actions">
          <button type="button" className="call-round call-decline" onClick={decline} disabled={busy} aria-label="Decline">
            <i className="fa-solid fa-phone-slash" />
            <span>Decline</span>
          </button>
          <button type="button" className="call-round call-answer" onClick={answer} disabled={busy} aria-label="Answer">
            <i className="fa-solid fa-video" />
            <span>{busy ? "Connecting" : "Answer"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
