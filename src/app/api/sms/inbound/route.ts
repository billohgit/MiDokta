import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/sms/phone";

/**
 * Incoming SMS webhook: a text sent to your SMS number is posted into the sender's most recent
 * conversation, so replies from patients and staff appear in the chat.
 *
 * Configure your provider to POST to:  https://<your-domain>/api/sms/inbound?token=<SMS_WEBHOOK_SECRET>
 * Works with Twilio (From, Body), Africa's Talking (from, text) and SMS Gateway for Android
 * (JSON: { event: "sms:received", payload: { phoneNumber, message } }).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SMS_WEBHOOK_SECRET;
  const token = Buffer.from(req.nextUrl.searchParams.get("token") ?? "");
  if (!secret || token.length !== Buffer.byteLength(secret) || !timingSafeEqual(token, Buffer.from(secret))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // SMS Gateway for Android posts JSON; Twilio and Africa's Talking post a form.
  const isJson = (req.headers.get("content-type") ?? "").includes("application/json");
  const incoming = isJson ? await readJson(req) : await readForm(req);

  for (const { from, body } of incoming) {
    const phone = normalizePhone(from);
    if (phone && body) await receive(phone, body.slice(0, 4000));
  }

  if (isJson) return NextResponse.json({ ok: true });
  // Twilio expects TwiML; an empty response means "don't auto-reply". Africa's Talking just needs a 200.
  return new NextResponse("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
}

type Incoming = { from: string; body: string };

async function readForm(req: NextRequest): Promise<Incoming[]> {
  const form = await req.formData().catch(() => null);
  return [
    {
      from: String(form?.get("From") ?? form?.get("from") ?? ""),
      body: String(form?.get("Body") ?? form?.get("text") ?? "").trim(),
    },
  ];
}

/**
 * SMS Gateway for Android sends one `sms:received` event, or a `sms:batch:received` array when
 * several arrive at once. Any other event (delivery reports, device pings) is ignored.
 */
async function readJson(req: NextRequest): Promise<Incoming[]> {
  const json = await req.json().catch(() => null);
  if (!json || typeof json !== "object") return [];

  // Only arrivals: this leaves out delivery reports (sms:sent, sms:delivered) and device pings.
  const event = String(json.event ?? "");
  if (event && !event.endsWith(":received")) return [];

  const payloads = Array.isArray(json.payload?.messages) ? json.payload.messages : [json.payload ?? json];
  return payloads
    .filter((p: unknown): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p: Record<string, unknown>) => ({
      from: String(p.phoneNumber ?? p.from ?? ""),
      body: String(p.message ?? p.text ?? "").trim(),
    }));
}

async function receive(from: string, body: string) {
  // Phone numbers are stored as typed, so compare normalised values.
  const candidates = await prisma.user.findMany({
    where: { isActive: true, phone: { not: null } },
    select: { id: true, phone: true },
  });
  const senderIds = candidates.filter((u) => normalizePhone(u.phone) === from).map((u) => u.id);

  const log = (userId: string | null, messageId: string | null, error: string | null) =>
    prisma.smsMessage.create({
      data: {
        direction: "INBOUND",
        to: from,
        body,
        category: "CHAT_REPLY",
        status: error ? "SKIPPED" : "SENT",
        error,
        userId,
        messageId,
        sentAt: new Date(),
      },
    });

  if (senderIds.length === 0) {
    await log(null, null, "Unknown phone number");
    return;
  }

  // The sender's most recent conversation (if several people share the number, the most recent across them).
  const participation = await prisma.conversationParticipant.findFirst({
    where: { userId: { in: senderIds } },
    orderBy: { conversation: { lastMessageAt: "desc" } },
  });

  let conversationId = participation?.conversationId;
  let senderId = participation?.userId ?? senderIds[0];

  if (!conversationId) {
    // No conversation yet: start one with the longest-serving active admin.
    const admin = await prisma.user.findFirst({ where: { role: Role.ADMIN, isActive: true }, orderBy: { createdAt: "asc" } });
    if (!admin) {
      await log(senderId, null, "No admin available to receive the message");
      return;
    }
    const key = [admin.id, senderId].sort().join(":");
    const conversation = await prisma.conversation.upsert({
      where: { directKey: key },
      update: {},
      create: { directKey: key, createdById: senderId, participants: { create: [{ userId: admin.id }, { userId: senderId }] } },
    });
    conversationId = conversation.id;
    senderId = senderIds[0];
  }

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({ data: { conversationId: conversationId!, senderId, body, source: "SMS" } });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: created.createdAt } });
    return created;
  });
  await log(senderId, message.id, null);
}
