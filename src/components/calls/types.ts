import type { CallStatus } from "@prisma/client";

/** The other person on a call, as the call screens show them. */
export type CallParty = { id: string; name: string; firstName: string; lastName: string; avatarUrl: string | null };

export type CallState = {
  id: string;
  status: CallStatus;
  /** Which side of the call the viewer is on. */
  side: "caller" | "callee";
  other: CallParty;
  /** The visit the call is filed under (doctors write it up there). */
  appointmentId: string | null;
  answeredAt: string | null;
};

export type IncomingCall = { id: string; from: CallParty };

export const ENDED_TEXT: Partial<Record<CallStatus, string>> = {
  DECLINED: "Call declined",
  MISSED: "No answer",
  CANCELLED: "Call cancelled",
  ENDED: "Call ended",
};

/** How often the call screens and the incoming-call watcher ask the server for news. */
export const CALL_POLL_MS = 2000;
export const INCOMING_POLL_MS = 3000;
