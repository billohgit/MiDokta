import "server-only";

import { type Prisma, Role, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/sms/phone";
import { PORTAL_ROLES } from "@/lib/roles";
import {
  type ChatMessage,
  type ChatUser,
  type ConversationSummary,
  type SmsSummary,
} from "@/components/chat/types";

/** Roles that can open the chat (everyone else takes part by SMS). */
export const CHAT_ROLES = PORTAL_ROLES;

export const chatUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
  phone: true,
  smsOptIn: true,
} as const;

type ChatUserRow = Prisma.UserGetPayload<{ select: typeof chatUserSelect }>;

export const toChatUser = (u: ChatUserRow): ChatUser => ({
  id: u.id,
  firstName: u.firstName,
  lastName: u.lastName,
  avatarUrl: u.avatarUrl,
  role: u.role,
  canSignIn: PORTAL_ROLES.includes(u.role),
  smsReachable: u.smsOptIn && !!normalizePhone(u.phone),
});

export const PAGE_SIZE = 50;

export const directKey = (a: string, b: string) => [a, b].sort().join(":");

export async function isParticipant(conversationId: string, userId: string) {
  const p = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { userId: true },
  });
  return !!p;
}

/**
 * Who `me` may add to conversations. Doctors are limited to their own patients;
 * admins and the staff roles work across the whole clinic, so they can reach anyone.
 */
function contactsWhere(me: Pick<User, "id" | "role">): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { isActive: true, id: { not: me.id } };
  if (me.role !== Role.DOCTOR) return base;
  return {
    ...base,
    OR: [
      { role: { not: Role.PATIENT } },
      { role: Role.PATIENT, patientAppointments: { some: { doctorId: me.id } } },
    ],
  };
}

export async function chatContacts(me: Pick<User, "id" | "role">): Promise<ChatUser[]> {
  const users = await prisma.user.findMany({
    where: contactsWhere(me),
    select: chatUserSelect,
    orderBy: [{ role: "asc" }, { firstName: "asc" }],
  });
  return users.map(toChatUser);
}

/** The subset of `ids` that `me` is allowed to add to a conversation. */
export async function allowedContactIds(me: Pick<User, "id" | "role">, ids: string[]) {
  const users = await prisma.user.findMany({
    where: { AND: [contactsWhere(me), { id: { in: [...new Set(ids)] } }] },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** The user's conversations, most recent first, with last message and unread count. */
export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const [participations, unreadRows] = await Promise.all([
    prisma.conversationParticipant.findMany({
      where: { userId },
      orderBy: { conversation: { lastMessageAt: "desc" } },
      include: {
        conversation: {
          include: {
            participants: { include: { user: { select: chatUserSelect } }, orderBy: { joinedAt: "asc" } },
            messages: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
    }),
    prisma.$queryRaw<{ conversationId: string; unread: number }[]>`
      SELECT m."conversationId", COUNT(*)::int AS unread
      FROM "Message" m
      JOIN "ConversationParticipant" p ON p."conversationId" = m."conversationId" AND p."userId" = ${userId}
      WHERE m."createdAt" > p."lastReadAt" AND m."senderId" <> ${userId}
      GROUP BY m."conversationId"`,
  ]);

  const unread = new Map(unreadRows.map((r) => [r.conversationId, r.unread]));

  return participations.map(({ conversation: c }) => {
    const last = c.messages[0];
    return {
      id: c.id,
      isGroup: c.isGroup,
      title: c.title,
      participants: c.participants.map((p) => toChatUser(p.user)),
      lastMessage: last ? { body: last.body, senderId: last.senderId, createdAt: last.createdAt.toISOString() } : null,
      lastMessageAt: c.lastMessageAt.toISOString(),
      unread: unread.get(c.id) ?? 0,
    };
  });
}

/** Total unread messages across all of a user's conversations (for the sidebar badge). */
export async function unreadMessageCount(userId: string) {
  const [row] = await prisma.$queryRaw<{ unread: number }[]>`
    SELECT COUNT(*)::int AS unread
    FROM "Message" m
    JOIN "ConversationParticipant" p ON p."conversationId" = m."conversationId" AND p."userId" = ${userId}
    WHERE m."createdAt" > p."lastReadAt" AND m."senderId" <> ${userId}`;
  return row?.unread ?? 0;
}

/** SMS delivery counts for outbound copies of the given chat messages. */
export async function smsSummaries(messageIds: string[]) {
  const summaries = new Map<string, SmsSummary>();
  if (messageIds.length === 0) return summaries;

  const rows = await prisma.smsMessage.groupBy({
    by: ["messageId", "status"],
    where: { messageId: { in: messageIds }, direction: "OUTBOUND" },
    _count: { _all: true },
  });
  for (const row of rows) {
    const s = summaries.get(row.messageId!) ?? { total: 0, sent: 0, pending: 0, failed: 0, skipped: 0 };
    const n = row._count._all;
    s.total += n;
    if (row.status === "SENT") s.sent += n;
    else if (row.status === "PENDING") s.pending += n;
    else if (row.status === "FAILED") s.failed += n;
    else s.skipped += n;
    summaries.set(row.messageId!, s);
  }
  return summaries;
}

type MessageRow = { id: string; conversationId: string; senderId: string; body: string; createdAt: Date; source: ChatMessage["source"] };

export const toChatMessage = (m: MessageRow, sms: SmsSummary | null = null): ChatMessage => ({
  id: m.id,
  conversationId: m.conversationId,
  senderId: m.senderId,
  body: m.body,
  createdAt: m.createdAt.toISOString(),
  source: m.source,
  sms,
});

/** Chat messages with their SMS delivery summaries. */
export async function withSms(messages: MessageRow[]) {
  const summaries = await smsSummaries(messages.map((m) => m.id));
  return messages.map((m) => toChatMessage(m, summaries.get(m.id) ?? null));
}
