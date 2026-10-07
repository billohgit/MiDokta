"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { answerCall, declineCall, hangUp } from "@/app/actions/calls";
import Avatar from "@/components/appointments/Avatar";
import CallButton from "./CallButton";
import { CALL_POLL_MS, type CallState, ENDED_TEXT } from "./types";
import { playRingback, unlockAudio } from "./sounds";

type Props = {
  initial: CallState;
  basePath: string;
  /** Doctors get a link to write up the visit during the call. */
  isDoctor: boolean;
};

const elapsed = (from: string | null, now: number) => {
  if (!from) return "";
  const s = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(s % 60).padStart(2, "0")}`;
};

/** One call from ringing to hang-up: the ringing screen, then the video, then how it ended. */
export default function CallScreen({ initial, basePath, isDoctor }: Props) {
  const router = useRouter();
  const [call, setCall] = useState(initial);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const live = call.status === "RINGING" || call.status === "ACCEPTED";
  const connected = call.status === "ACCEPTED";

  // Poll while the call is live; this also tells the server we're still on it.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/calls/${call.id}`, { cache: "no-store" });
        if (res.ok) setCall((await res.json()).call);
      } catch {
        // Try again on the next tick.
      }
    }, CALL_POLL_MS);
    return () => clearInterval(timer);
  }, [call.id, live]);

  // Once answered, fetch this side's room link (with its own meeting token).
  useEffect(() => {
    if (!connected || url) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/calls/${call.id}?join=1`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (data.url) setUrl(data.url);
        else setError(data.error ?? "The call couldn't be connected.");
        if (data.call) setCall(data.call);
      } catch {
        if (!cancelled) setError("The call couldn't be connected. Check your connection.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [call.id, connected, url]);

  // The caller hears ringing until the other side answers.
  useEffect(() => {
    if (call.status !== "RINGING" || call.side !== "caller") return;
    return playRingback();
  }, [call.status, call.side]);

  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [connected]);

  // Leaving the video when the call ends drops the camera and microphone straight away.
  useEffect(() => {
    if (!live) setUrl(null);
  }, [live]);

  const act = async (action: () => Promise<{ ok: boolean; error?: string }>, next?: CallState["status"]) => {
    setBusy(true);
    unlockAudio();
    const result = await action().catch(() => ({ ok: false, error: "Couldn't reach the server. Check your connection." }));
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Something went wrong.");
    else if (next) setCall((c) => ({ ...c, status: next }));
  };

  const answer = () =>
    act(async () => {
      const r = await answerCall(call.id);
      if (r.ok) setCall((c) => ({ ...c, status: "ACCEPTED", answeredAt: new Date().toISOString() }));
      return r;
    });
  const end = () => act(() => hangUp(call.id), call.status === "RINGING" ? "CANCELLED" : "ENDED");
  const decline = () => act(() => declineCall(call.id), "DECLINED");

  if (connected) {
    return (
      <div className="call-live">
        <header className="call-bar">
          <Avatar person={call.other} size={40} />
          <div className="call-bar-text">
            <strong>{call.other.name}</strong>
            <small>{url ? elapsed(call.answeredAt, now) : "Connecting..."}</small>
          </div>
          {isDoctor && call.appointmentId && (
            <Link href={`/doctor/appointments/${call.appointmentId}`} target="_blank" className="btn btn-outline btn-sm call-notes">
              <i className="fa-solid fa-notes-medical btn-icon" /> <span>Consultation notes</span>
            </Link>
          )}
          <button type="button" className="btn btn-sm call-hangup" onClick={end} disabled={busy}>
            <i className="fa-solid fa-phone-slash" /> <span>End call</span>
          </button>
        </header>
        {error && <p className="form-error">{error}</p>}
        {url ? (
          <iframe
            className="call-frame"
            src={url}
            title={`Video call with ${call.other.name}`}
            allow="camera; microphone; fullscreen; speaker; display-capture; autoplay; compute-pressure"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="call-frame call-connecting">
            <i className="fa-solid fa-spinner fa-spin" /> Connecting the video...
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="call-stage card">
      <div className={`call-stage-avatar${call.status === "RINGING" ? " ringing" : ""}`}>
        <Avatar person={call.other} size={128} />
      </div>
      <h2>{call.other.name}</h2>

      {call.status === "RINGING" ? (
        call.side === "caller" ? (
          <>
            <p className="call-stage-status">Ringing...</p>
            <div className="incoming-actions">
              <button type="button" className="call-round call-decline" onClick={end} disabled={busy} aria-label="Cancel call">
                <i className="fa-solid fa-phone-slash" />
                <span>Cancel</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="call-stage-status">is calling you</p>
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
          </>
        )
      ) : (
        <>
          <p className="call-stage-status">
            {call.status === "DECLINED" && call.side === "callee" ? "You declined this call" : ENDED_TEXT[call.status]}
          </p>
          <div className="call-stage-actions">
            <CallButton calleeId={call.other.id} name={call.other.name} basePath={basePath} label={call.side === "callee" ? "Call back" : "Call again"} />
            <button type="button" className="btn btn-outline btn-sm" onClick={() => router.push(`${basePath}/calls`)}>
              All calls
            </button>
          </div>
        </>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
