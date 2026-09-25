import "server-only";

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { isUniqueViolation } from "@/lib/form";
import { allowlistBlock } from "./allowlist";
import { normalizePhone } from "./phone";
import { getSmsProvider } from "./providers";

export type SmsCategory =
  | "APPOINTMENT_REQUESTED"
  | "APPOINTMENT_CONFIRMED"
  | "APPOINTMENT_REJECTED"
  | "APPOINTMENT_CANCELLED"
  | "APPOINTMENT_ASSIGNED"
  | "APPOINTMENT_REMINDER"
  | "VIDEO_CALL"
  | "FOLLOW_UP_REMINDER"
  | "DAILY_SCHEDULE"
  | "INVOICE_CREATED"
  | "PAYMENT_RECEIVED"
  | "CHAT";

type SmsInput = {
  userId: string;
  body: string;
  category: SmsCategory;
  /** Skip if a message with this key was already queued (for scheduled messages). */
  dedupeKey?: string;
  sentById?: string;
  /** The chat message this SMS delivers. */
  messageId?: string;
};

const DELIVERY_CONCURRENCY = 5;

/**
 * Records SMS messages for users and delivers them after the response is sent.
 * Users without a valid phone number, who opted out, or who are inactive are logged as SKIPPED.
 * Never throws for delivery problems, so it's safe to call from any action.
 */
export async function queueSms(inputs: SmsInput | SmsInput[]) {
  const list = Array.isArray(inputs) ? inputs : [inputs];
  if (list.length === 0) return { queued: 0, skipped: 0 };

  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(list.map((i) => i.userId))] } },
    select: { id: true, phone: true, smsOptIn: true, isActive: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const pendingIds: string[] = [];
  let skipped = 0;

  for (const input of list) {
    const user = byId.get(input.userId);
    const to = normalizePhone(user?.phone);
    const skipReason = !user
      ? "User not found"
      : !user.isActive
        ? "Account inactive"
        : !user.smsOptIn
          ? "Opted out of SMS"
          : !user.phone
            ? "No phone number"
            : !to
              ? "Invalid phone number"
              : allowlistBlock(to);

    try {
      const row = await prisma.smsMessage.create({
        data: {
          userId: input.userId,
          to: to ?? user?.phone ?? null,
          body: input.body,
          category: input.category,
          dedupeKey: input.dedupeKey,
          sentById: input.sentById,
          messageId: input.messageId,
          status: skipReason ? "SKIPPED" : "PENDING",
          error: skipReason,
        },
      });
      if (skipReason) skipped++;
      else pendingIds.push(row.id);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // duplicate dedupeKey: already handled earlier
    }
  }

  if (pendingIds.length) after(() => deliverSms(pendingIds));
  return { queued: pendingIds.length, skipped };
}

/** Sends PENDING messages by id and records the outcome. */
export async function deliverSms(ids: string[]) {
  const provider = getSmsProvider();
  const messages = await prisma.smsMessage.findMany({ where: { id: { in: ids }, status: "PENDING" } });

  for (let i = 0; i < messages.length; i += DELIVERY_CONCURRENCY) {
    await Promise.all(
      messages.slice(i, i + DELIVERY_CONCURRENCY).map(async (m) => {
        try {
          // Re-checked here because retries and the scheduled job also land in this path.
          const blocked = allowlistBlock(m.to);
          if (blocked) {
            await prisma.smsMessage.update({ where: { id: m.id }, data: { status: "SKIPPED", error: blocked } });
            return;
          }

          const result = await provider.send(m.to!, m.body);
          await prisma.smsMessage.update({
            where: { id: m.id },
            data: {
              status: "SENT",
              provider: provider.name,
              providerMessageId: result.providerMessageId,
              sentAt: new Date(),
              error: null,
            },
          });
        } catch (e) {
          await prisma.smsMessage.update({
            where: { id: m.id },
            data: { status: "FAILED", provider: provider.name, error: e instanceof Error ? e.message.slice(0, 500) : "Send failed" },
          });
        }
      })
    );
  }
}

export { normalizePhone, PHONE_HINT } from "./phone";
