"use server";

import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { CHAT_ROLES, allowedContactIds, directKey, isParticipant, toChatMessage } from "@/lib/chat";
import { isUniqueViolation } from "@/lib/form";
import { PORTAL_ROLES } from "@/lib/roles";
import { queueSms } from "@/lib/sms";
import { SMS_BRAND, gsmSafe } from "@/lib/sms/templates";
import {
  type ChatMessage,
  MAX_MESSAGE_LENGTH,
  MAX_SMS_MESSAGE_LENGTH,
  displayName,
} from "@/components/chat/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_TITLE_LENGTH = 80;

const fail = (error: string) => ({ ok: false as const, error });
const DENIED = fail("You are not allowed to do that.");

/**
 * Posts a chat message. Participants who can't sign in (patients) always receive it
 * by SMS; everyone with a portal reads it in the app, and also gets an SMS when
 * `alsoSms` is true.
 */
export async function sendMessage(
  conversationId: string,
  body: string,
  alsoSms = true
): Promise<Result<{ message: ChatMessage; smsQueued: number; smsSkipped: number }>> {
  const me = await authorize(...CHAT_ROLES);
  if (!me) return DENIED;

  const text = String(body ?? "").trim();
  if (!text) return fail("Message can't be empty.");
  if (text.length > MAX_MESSAGE_LENGTH) return fail(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: { include: { user: { select: { id: true, role: true } } } } },
  });
  if (!conversation?.participants.some((p) => p.userId === me.id)) return DENIED;

  const smsRecipients = conversation.participants
    .map((p) => p.user)
    .filter((u) => u.id !== me.id && (alsoSms || !PORTAL_ROLES.includes(u.role)));
  if (smsRecipients.length && text.length > MAX_SMS_MESSAGE_LENGTH) {
    return fail(`Messages sent by SMS are limited to ${MAX_SMS_MESSAGE_LENGTH} characters.`);
  }

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({ data: { conversationId, senderId: me.id, body: text } });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: created.createdAt } });
    await tx.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: me.id } },
      data: { lastReadAt: created.createdAt },
    });
    return created;
  });

  const from = me.role === Role.DOCTOR ? displayName(me) : `${me.firstName} ${me.lastName}`;
  const heading = conversation.isGroup ? `${SMS_BRAND} (${conversation.title}) ${from}` : `${SMS_BRAND} - ${from}`;
  const sms = await queueSms(
    smsRecipients.map((u) => ({
      userId: u.id,
      category: "CHAT" as const,
      body: gsmSafe(`${heading}: ${text}`),
      sentById: me.id,
      messageId: message.id,
    }))
  );

  const summary = smsRecipients.length
    ? { total: smsRecipients.length, sent: 0, pending: sms.queued, failed: 0, skipped: sms.skipped }
    : null;
  return { ok: true, message: toChatMessage(message, summary), smsQueued: sms.queued, smsSkipped: sms.skipped };
}

/** Opens the one-to-one conversation with `userId`, creating it if needed. */
export async function startDirectConversation(userId: string): Promise<Result<{ id: string }>> {
  const me = await authorize(...CHAT_ROLES);
  if (!me) return DENIED;
  if (userId === me.id) return fail("You can't start a chat with yourself.");
  if ((await allowedContactIds(me, [userId])).length === 0) return fail("That person isn't available to chat.");

  const key = directKey(me.id, userId);
  const existing = await prisma.conversation.findUnique({ where: { directKey: key }, select: { id: true } });
  if (existing) {
    // Rejoin if this user had been removed from it.
    await prisma.conversationParticipant.createMany({
      data: [{ conversationId: existing.id, userId: me.id }],
      skipDuplicates: true,
    });
    return { ok: true, id: existing.id };
  }

  try {
    const created = await prisma.conversation.create({
      data: {
        directKey: key,
        createdById: me.id,
        participants: { create: [{ userId: me.id }, { userId }] },
      },
    });
    return { ok: true, id: created.id };
  } catch (e) {
    // Someone created the same chat at the same moment.
    if (isUniqueViolation(e)) {
      const again = await prisma.conversation.findUniqueOrThrow({ where: { directKey: key }, select: { id: true } });
      return { ok: true, id: again.id };
    }
    throw e;
  }
}

export async function createGroupConversation(title: string, memberIds: string[]): Promise<Result<{ id: string }>> {
  const me = await authorize(...CHAT_ROLES);
  if (!me) return DENIED;

  const name = String(title ?? "").trim();
  if (!name) return fail("Give the group a name.");
  if (name.length > MAX_TITLE_LENGTH) return fail(`Group names are limited to ${MAX_TITLE_LENGTH} characters.`);

  const members = await allowedContactIds(me, memberIds);
  if (members.length === 0) return fail("Add at least one person to the group.");

  const created = await prisma.conversation.create({
    data: {
      title: name,
      isGroup: true,
      createdById: me.id,
      participants: { create: [{ userId: me.id }, ...members.map((userId) => ({ userId }))] },
    },
  });
  return { ok: true, id: created.id };
}

export async function addGroupMembers(conversationId: string, memberIds: string[]): Promise<Result> {
  const me = await authorize(...CHAT_ROLES);
  if (!me) return DENIED;

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation?.isGroup || !(await isParticipant(conversationId, me.id))) return DENIED;

  const members = await allowedContactIds(me, memberIds);
  if (members.length === 0) return fail("Choose at least one person to add.");

  await prisma.conversationParticipant.createMany({
    data: members.map((userId) => ({ conversationId, userId })),
    skipDuplicates: true,
  });
  return { ok: true };
}

export async function leaveGroup(conversationId: string): Promise<Result> {
  const me = await authorize(...CHAT_ROLES);
  if (!me) return DENIED;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: { include: { user: { select: { role: true } } } } },
  });
  if (!conversation?.isGroup || !conversation.participants.some((p) => p.userId === me.id)) return DENIED;

  const remainingAppUsers = conversation.participants.filter(
    (p) => p.userId !== me.id && PORTAL_ROLES.includes(p.user.role)
  ).length;
  if (remainingAppUsers === 0) {
    // Nobody left who can read the group in the app: remove it entirely.
    await prisma.conversation.delete({ where: { id: conversationId } });
  } else {
    await prisma.conversationParticipant.delete({ where: { conversationId_userId: { conversationId, userId: me.id } } });
  }
  return { ok: true };
}

export async function markConversationRead(conversationId: string): Promise<Result> {
  const me = await authorize(...CHAT_ROLES);
  if (!me) return DENIED;
  await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId: me.id },
    data: { lastReadAt: new Date() },
  });
  return { ok: true };
}
