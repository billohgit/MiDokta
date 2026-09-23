import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { CHAT_ROLES, PAGE_SIZE, isParticipant, smsSummaries, withSms } from "@/lib/chat";

/**
 * GET /api/chat/conversations/:id/messages
 *   ?after=ISO     messages at or after this time (for polling; the client de-duplicates by id)
 *   ?before=ISO    the page of older messages before this time
 *   (neither)      the latest page
 *   &smsFor=a,b    also return current SMS delivery summaries for these message ids
 * Messages are returned oldest first.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await authorize(...CHAT_ROLES);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await isParticipant(id, me.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const search = req.nextUrl.searchParams;
  const after = parseDate(search.get("after"));
  const before = parseDate(search.get("before"));
  const noStore = { headers: { "Cache-Control": "no-store" } };

  // Only summaries for messages in this conversation.
  const requested = (search.get("smsFor") ?? "").split(",").filter(Boolean).slice(0, 100);
  const inConversation = requested.length
    ? (await prisma.message.findMany({ where: { id: { in: requested }, conversationId: id }, select: { id: true } })).map((m) => m.id)
    : [];
  const sms = Object.fromEntries(await smsSummaries(inConversation));

  if (after) {
    const messages = await prisma.message.findMany({
      where: { conversationId: id, createdAt: { gte: after } },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    return NextResponse.json({ messages: await withSms(messages), hasMore: false, sms }, noStore);
  }

  const page = await prisma.message.findMany({
    where: { conversationId: id, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
  });
  const hasMore = page.length > PAGE_SIZE;
  const messages = await withSms(page.slice(0, PAGE_SIZE).reverse());
  return NextResponse.json({ messages, hasMore, sms }, noStore);
}

function parseDate(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}
