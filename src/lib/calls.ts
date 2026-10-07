import "server-only";

import { randomBytes } from "crypto";
import { type Call, Role, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyUsers } from "@/lib/notifications";
import { queueSms } from "@/lib/sms";
import { sms } from "@/lib/sms/templates";
import { CALL_ROLES } from "@/lib/roles";

/**
 * Video calls between doctors and their patients, placed inside the app. The caller rings the other
 * person, whose portal shows an incoming call with Answer and Decline (it polls /api/calls/incoming).
 * Once answered, both sides join the same private Daily (daily.co) room, each with their own
 * meeting token, so nobody else can get in. Nothing is sent by link.
 */

const API = "https://api.daily.co/v1";

/** An unanswered call stops ringing after this long and counts as missed. */
export const RING_TIMEOUT_MS = 45_000;
/** The caller's call screen checks in every couple of seconds; if it stops, they hung up. */
const CALLER_GONE_MS = 15_000;
/** A connected call with neither side's call screen open any more has ended. */
const ABANDONED_MS = 60_000;
/** The room (and everyone's token) expires this long after the call is placed. */
const ROOM_LIFETIME_MS = 3 * 60 * 60 * 1000;

export const videoConfigured = () => Boolean(process.env.DAILY_API_KEY);

export const NOT_SET_UP = "Video calls aren't set up yet. Add DAILY_API_KEY to the server settings.";

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

/** A new private room for one call. */
export async function createRoom() {
  const expiresAt = new Date(Date.now() + ROOM_LIFETIME_MS);
  const room = await daily<{ name: string; url: string }>("/rooms", {
    name: `midokta-${randomBytes(8).toString("hex")}`,
    privacy: "private",
    properties: {
      exp: Math.floor(expiresAt.getTime() / 1000),
      eject_at_room_exp: true,
      // The call was already answered, so go straight in rather than through a lobby.
      enable_prejoin_ui: false,
      enable_chat: true,
      enable_screenshare: true,
      max_participants: 4,
      lang: "en",
    },
  });
  return { roomName: room.name, roomUrl: room.url, roomExpiresAt: expiresAt };
}

/** The room URL with a meeting token for one participant, or null once the room has expired. */
export async function joinUrl(call: Pick<Call, "roomName" | "roomUrl" | "roomExpiresAt">, who: { name: string; isOwner: boolean }) {
  if (call.roomExpiresAt.getTime() <= Date.now()) return null;
  const { token } = await daily<{ token: string }>("/meeting-tokens", {
    properties: {
      room_name: call.roomName,
      user_name: who.name,
      is_owner: who.isOwner,
      exp: Math.floor(call.roomExpiresAt.getTime() / 1000),
      eject_at_token_exp: true,
    },
  });
  return `${call.roomUrl}?t=${encodeURIComponent(token)}`;
}

/** How a person is named on the other side of a call. */
export const callName = (u: Pick<User, "firstName" | "lastName" | "role">) =>
  u.role === Role.DOCTOR ? `Dr. ${u.firstName} ${u.lastName}` : `${u.firstName} ${u.lastName}`;

/** Doctors call their patients and patients call their doctors: anyone they have an appointment with. */
export async function canCall(me: Pick<User, "id" | "role">, other: Pick<User, "id" | "role" | "isActive">) {
  if (!other.isActive || other.id === me.id || !CALL_ROLES.includes(me.role) || !CALL_ROLES.includes(other.role)) return false;
  if (me.role === other.role) return false;
  const [doctorId, patientId] = me.role === Role.DOCTOR ? [me.id, other.id] : [other.id, me.id];
  return (await prisma.appointment.count({ where: { doctorId, patientId } })) > 0;
}

/** Calls still in progress: ringing, or connected. */
export const LIVE = ["RINGING", "ACCEPTED"] as const;

/** Whether the user is on a call (or being rung) right now. */
export async function isBusy(userId: string) {
  const live = await prisma.call.count({
    where: { status: { in: [...LIVE] }, OR: [{ callerId: userId }, { calleeId: userId }] },
  });
  return live > 0;
}

/**
 * Ends calls that nobody closed properly: unanswered calls that rang out or whose caller left, and
 * connected calls whose room expired or that neither side has open. Scoped to one user's calls, so
 * it's cheap enough to run on every poll; the scheduled job runs it for everyone.
 */
export async function expireStaleCalls(userId?: string) {
  const now = Date.now();
  const mine = userId ? { OR: [{ callerId: userId }, { calleeId: userId }] } : {};

  const unanswered = await prisma.call.findMany({
    where: {
      ...mine,
      status: "RINGING",
      AND: [{ OR: [{ createdAt: { lt: new Date(now - RING_TIMEOUT_MS) } }, { callerSeenAt: { lt: new Date(now - CALLER_GONE_MS) } }] }],
    },
    include: { caller: true, callee: true },
  });
  for (const call of unanswered) {
    const { count } = await prisma.call.updateMany({
      where: { id: call.id, status: "RINGING" },
      data: { status: "MISSED", endedAt: new Date() },
    });
    if (count) await notifyMissed(call);
  }

  const abandoned = new Date(now - ABANDONED_MS);
  await prisma.call.updateMany({
    where: {
      ...mine,
      status: "ACCEPTED",
      AND: [
        {
          OR: [
            { roomExpiresAt: { lt: new Date(now) } },
            { callerSeenAt: { lt: abandoned }, OR: [{ calleeSeenAt: null }, { calleeSeenAt: { lt: abandoned } }] },
          ],
        },
      ],
    },
    data: { status: "ENDED", endedAt: new Date() },
  });
}

/** Tells the person who was rung that they missed a call: in the app, and by text for patients. */
async function notifyMissed(call: Call & { caller: User; callee: User }) {
  const from = callName(call.caller);
  await notifyUsers([call.calleeId], {
    type: "VIDEO_CALL",
    title: "Missed video call",
    body: `${from} tried to video call you.`,
    link: "{portal}/calls",
  });
  if (call.callee.role === Role.PATIENT) {
    await queueSms({ userId: call.calleeId, category: "VIDEO_CALL", body: sms.missedCall(call.callee, from) });
  }
}

/** A video visit counts as "now" from this long before its start to this long after. */
const NOW_WINDOW_BEFORE_MS = 60 * 60 * 1000;
const NOW_WINDOW_AFTER_MS = 3 * 60 * 60 * 1000;

/** The pair's confirmed video appointment around now, if there is one. */
export async function currentVideoAppointment(doctorId: string, patientId: string) {
  const now = Date.now();
  return prisma.appointment.findFirst({
    where: {
      doctorId,
      patientId,
      visitType: "VIDEO_CALL",
      status: "CONFIRMED",
      startsAt: { gte: new Date(now - NOW_WINDOW_AFTER_MS), lte: new Date(now + NOW_WINDOW_BEFORE_MS) },
    },
    orderBy: { startsAt: "desc" },
    select: { id: true },
  });
}

/**
 * The appointment an answered call is written up under: the one it was placed from, the pair's
 * video appointment around now, or a new "Video visit" booked for now so the visit is on record.
 */
export async function visitForCall(call: Pick<Call, "appointmentId">, doctor: Pick<User, "id" | "hospitalId">, patientId: string) {
  if (call.appointmentId) return call.appointmentId;
  const current = await currentVideoAppointment(doctor.id, patientId);
  if (current) return current.id;
  const created = await prisma.appointment.create({
    data: {
      title: "Video visit",
      startsAt: new Date(),
      status: "CONFIRMED",
      visitType: "VIDEO_CALL",
      doctorId: doctor.id,
      patientId,
      hospitalId: doctor.hospitalId,
    },
  });
  return created.id;
}
