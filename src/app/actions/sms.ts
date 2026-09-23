"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { type ActionResult, DENIED, fail } from "@/lib/form";
import { deliverSms, normalizePhone } from "@/lib/sms";
import { allowlistBlock } from "@/lib/sms/allowlist";
import { runScheduledSms } from "@/lib/sms/scheduled";

export async function retrySms(id: string): Promise<ActionResult> {
  if (!(await authorize(Role.ADMIN))) return DENIED;

  const message = await prisma.smsMessage.findUnique({ where: { id }, include: { user: true } });
  if (!message) return fail("Message not found.");
  if (message.direction !== "OUTBOUND") return fail("Received messages can't be retried.");
  if (message.status !== "FAILED" && message.status !== "SKIPPED") return fail("Only failed or skipped messages can be retried.");

  // Re-check the recipient: their phone number or preferences may have changed since.
  const to = normalizePhone(message.user?.phone);
  if (!message.user || !message.user.isActive) return fail("The recipient's account is no longer active.");
  if (!message.user.smsOptIn) return fail("The recipient has opted out of SMS.");
  if (!to) return fail("The recipient doesn't have a valid phone number.");

  const blocked = allowlistBlock(to);
  if (blocked) return fail(`${to} is not in SMS_ALLOWED_NUMBERS, so nothing would be sent.`);

  await prisma.smsMessage.update({ where: { id }, data: { status: "PENDING", to, error: null } });
  after(() => deliverSms([id]));

  revalidatePath("/admin/sms");
  return { ok: true };
}

export async function runScheduledSmsNow(): Promise<ActionResult & { summary?: Awaited<ReturnType<typeof runScheduledSms>> }> {
  if (!(await authorize(Role.ADMIN))) return DENIED;
  const summary = await runScheduledSms();
  revalidatePath("/admin/sms");
  return { ok: true, summary };
}
