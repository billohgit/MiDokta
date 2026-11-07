import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { normalizePhone } from "@/lib/sms/phone";
import { queueSms } from "@/lib/sms";
import { sms } from "@/lib/sms/templates";

/**
 * "Forgot password": a 6-digit code is texted to the phone number on the account, and with it the
 * person sets a new password. The app has no email sending, so the phone on file is the channel;
 * someone without one asks an administrator, who can set a new password for staff.
 *
 * The responses never say whether an account exists, codes are stored hashed and expire quickly,
 * and a successful reset signs out every other session (see `passwordChangedAt` in src/lib/auth.ts).
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
/** At most this many codes per account in the window, so nobody can flood a phone with texts. */
const MAX_CODES = 3;
const CODES_WINDOW_MS = 15 * 60 * 1000;

function hash(userId: string, code: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be set");
  return createHmac("sha256", `reset:${secret}`).update(`${userId}:${code}`).digest("hex");
}

/**
 * The account an email or phone number points to. A phone number can be shared (a family), so it
 * only identifies an account when exactly one active account has it.
 */
export async function findAccount(identifier: { email: string } | { phone: string }): Promise<User | null> {
  if ("email" in identifier) {
    const user = await prisma.user.findUnique({ where: { email: identifier.email.toLowerCase() } });
    return user?.isActive ? user : null;
  }
  // Phone numbers are stored as typed, so compare normalised values.
  const candidates = await prisma.user.findMany({ where: { isActive: true, phone: { not: null } } });
  const matches = candidates.filter((u) => normalizePhone(u.phone) === identifier.phone);
  return matches.length === 1 ? matches[0] : null;
}

/** Texts a reset code to the account's phone, if there is one. Says nothing either way. */
export async function sendResetCode(user: User | null): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!user || !normalizePhone(user.phone)) return { ok: true };
  const recent = await prisma.passwordResetCode.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - CODES_WINDOW_MS) } } });
  if (recent >= MAX_CODES) return { ok: false, error: "Too many codes requested. Wait 15 minutes and try again." };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.passwordResetCode.create({ data: { userId: user.id, codeHash: hash(user.id, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) } });
  // Sent even if texts are turned off: they asked for this one. LOGIN_CODE hides the code in the SMS log.
  await queueSms({ userId: user.id, category: "LOGIN_CODE", body: sms.passwordResetCode(code), ignoreOptOut: true });
  return { ok: true };
}

/** Checks the latest code and sets the new password. Signs out every existing session. */
export async function resetPassword(user: User | null, code: string, newPassword: string): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  const expired = { ok: false as const, error: "That code has expired or isn't right. Request a new one." };
  if (!user) return expired;
  const latest = await prisma.passwordResetCode.findFirst({ where: { userId: user.id, usedAt: null }, orderBy: { createdAt: "desc" } });
  if (!latest || latest.expiresAt < new Date() || latest.attempts >= MAX_ATTEMPTS) return expired;

  const given = Buffer.from(hash(user.id, code.replace(/\D/g, "")));
  const expected = Buffer.from(latest.codeHash);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    const { attempts } = await prisma.passwordResetCode.update({ where: { id: latest.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: attempts >= MAX_ATTEMPTS ? "Too many wrong tries. Request a new code." : "That code isn't right. Check the text and try again." };
  }

  // Use the code up first, so it can't be used twice even if two requests race.
  const { count } = await prisma.passwordResetCode.updateMany({ where: { id: latest.id, usedAt: null }, data: { usedAt: new Date() } });
  if (count === 0) return expired;
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { password: await hashPassword(newPassword), passwordChangedAt: new Date() },
  });
  return { ok: true, user: updated };
}
