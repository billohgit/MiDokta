import "server-only";

import { randomBytes } from "crypto";
import { headers } from "next/headers";
import type { Appointment } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Video visits run on Daily (daily.co). Each video appointment gets a private room; nobody can
 * enter without a meeting token, which we mint per visit: an owner token for the doctor, and a
 * guest token for the patient, who joins from the link texted to them (/call/<key>).
 */

const API = "https://api.daily.co/v1";

/** Rooms stay open this long after the appointment's start time. */
const ROOM_GRACE_MS = 3 * 60 * 60 * 1000;
/** A room is always usable for at least this long after the doctor starts the call. */
const MIN_ROOM_LIFETIME_MS = 2 * 60 * 60 * 1000;

export const videoConfigured = () => Boolean(process.env.DAILY_API_KEY);

async function daily<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Daily ${path} failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

const hasLiveRoom = (a: Pick<Appointment, "videoRoomUrl" | "videoRoomExpiresAt">) =>
  Boolean(a.videoRoomUrl && a.videoRoomExpiresAt && a.videoRoomExpiresAt.getTime() > Date.now());

/** Creates the appointment's room (or a fresh one if the last expired) and its patient link key. */
export async function ensureRoom(appt: Appointment): Promise<Appointment> {
  if (hasLiveRoom(appt) && appt.videoPatientKey) return appt;

  const expiresAt = new Date(
    Math.max(appt.startsAt.getTime() + ROOM_GRACE_MS, Date.now() + MIN_ROOM_LIFETIME_MS),
  );
  const room = await daily<{ name: string; url: string }>("/rooms", {
    name: `midokta-${appt.id}-${randomBytes(3).toString("hex")}`,
    privacy: "private",
    properties: {
      exp: Math.floor(expiresAt.getTime() / 1000),
      eject_at_room_exp: true,
      enable_prejoin_ui: true,
      enable_chat: true,
      enable_screenshare: true,
      max_participants: 4,
      lang: "en",
    },
  });

  return prisma.appointment.update({
    where: { id: appt.id },
    data: {
      videoRoomName: room.name,
      videoRoomUrl: room.url,
      videoRoomExpiresAt: expiresAt,
      // Unguessable: this key alone lets the patient in, so it's as long as a password reset token.
      videoPatientKey: appt.videoPatientKey ?? randomBytes(24).toString("base64url"),
    },
  });
}

/** The URL of the room with a meeting token for one participant, or null if the room has expired. */
export async function joinUrl(
  appt: Pick<Appointment, "videoRoomName" | "videoRoomUrl" | "videoRoomExpiresAt">,
  who: { name: string; isOwner: boolean },
): Promise<string | null> {
  if (!hasLiveRoom(appt)) return null;
  const { token } = await daily<{ token: string }>("/meeting-tokens", {
    properties: {
      room_name: appt.videoRoomName,
      user_name: who.name,
      is_owner: who.isOwner,
      exp: Math.floor(appt.videoRoomExpiresAt!.getTime() / 1000),
      eject_at_token_exp: true,
    },
  });
  return `${appt.videoRoomUrl}?t=${encodeURIComponent(token)}`;
}

/** The public link the patient opens to join. Uses APP_URL, else the current request's host. */
export async function patientLink(key: string): Promise<string> {
  let base = process.env.APP_URL?.replace(/\/+$/, "");
  if (!base) {
    const h = await headers();
    base = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  }
  return `${base}/call/${key}`;
}
