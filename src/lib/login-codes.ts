import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/sms/phone";
import { queueSms } from "@/lib/sms";
import { sms } from "@/lib/sms/templates";

/**
 * Patients sign in with a one-time code texted to the phone number the clinic has on file, so they
 * have no password to remember. Codes are stored hashed, expire quickly, and allow a few tries only.
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
/** At most this many codes per number in the window, so nobody can flood a phone with texts. */
const MAX_CODES = 3;
const CODES_WINDOW_MS = 15 * 60 * 1000;

function hash(phone: string, code: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be set");
  return createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

/** Active patients whose phone number is `phone` (E.164). A family can share one number. */
export async function patientsWithPhone(phone: string) {
  // Phone numbers are stored as typed, so compare normalised values.
  const candidates = await prisma.user.findMany({
    where: { role: Role.PATIENT, isActive: true, phone: { not: null } },
    orderBy: { firstName: "asc" },
  });
  return candidates.filter((u) => normalizePhone(u.phone) === phone);
}

/**
 * Texts a sign-in code to `phone` if it belongs to a patient. Says nothing about whether it does,
 * so the form can't be used to find out who is a patient here.
 */
export async function sendLoginCode(phone: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const recent = await prisma.loginCode.count({ where: { phone, createdAt: { gte: new Date(Date.now() - CODES_WINDOW_MS) } } });
  if (recent >= MAX_CODES) return { ok: false, error: "Too many codes requested for this number. Wait 15 minutes and try again." };

  const [patient] = await patientsWithPhone(phone);
  if (!patient) return { ok: true };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.loginCode.create({ data: { phone, codeHash: hash(phone, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) } });
  // Sent even if the patient turned off texts: they asked for this one.
  await queueSms({ userId: patient.id, category: "LOGIN_CODE", body: sms.loginCode(code), ignoreOptOut: true });
  return { ok: true };
}

export type CodeCheck =
  | { ok: false; error: string }
  | { ok: true; codeId: string; patients: Awaited<ReturnType<typeof patientsWithPhone>> };

/** Checks the latest code sent to `phone`. On success the caller signs in, or asks which patient. */
export async function checkLoginCode(phone: string, code: string): Promise<CodeCheck> {
  const latest = await prisma.loginCode.findFirst({
    where: { phone, usedAt: null, verifiedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!latest || latest.expiresAt < new Date() || latest.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "That code has expired. Send a new one." };
  }

  const given = Buffer.from(hash(phone, code.replace(/\D/g, "")));
  const expected = Buffer.from(latest.codeHash);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    const { attempts } = await prisma.loginCode.update({ where: { id: latest.id }, data: { attempts: { increment: 1 } } });
    return {
      ok: false,
      error: attempts >= MAX_ATTEMPTS ? "Too many wrong tries. Send a new code." : "That code isn't right. Check the text and try again.",
    };
  }

  const patients = await patientsWithPhone(phone);
  if (patients.length === 0) return { ok: false, error: "This account isn't active. Contact the clinic." };
  await prisma.loginCode.update({ where: { id: latest.id }, data: { verifiedAt: new Date() } });
  return { ok: true, codeId: latest.id, patients };
}

/**
 * Uses up a verified code to sign in as `userId`, who must be one of the patients on its number.
 * Returns false if the code was already used, expired, or never verified.
 */
export async function redeemLoginCode(codeId: string, userId: string): Promise<boolean> {
  const code = await prisma.loginCode.findUnique({ where: { id: codeId } });
  if (!code?.verifiedAt || code.usedAt || code.expiresAt < new Date()) return false;
  if (!(await patientsWithPhone(code.phone)).some((p) => p.id === userId)) return false;
  const { count } = await prisma.loginCode.updateMany({ where: { id: codeId, usedAt: null }, data: { usedAt: new Date() } });
  return count === 1;
}
