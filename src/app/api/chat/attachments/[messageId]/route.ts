import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { CHAT_ROLES, isParticipant } from "@/lib/chat";
import { readAttachment, viewingLink } from "@/lib/chat-attachments";

/**
 * Shows a chat attachment to a member of its conversation: a redirect to a link to the private file
 * that works for a few minutes (so large videos stream straight from storage), or the file itself
 * in development.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const me = await authorize(...CHAT_ROLES);
  if (!me) return new NextResponse("Unauthorized", { status: 401 });
  const { messageId } = await params;
  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { conversationId: true, attachmentRef: true, attachmentType: true } });
  if (!message?.attachmentRef || !message.attachmentType || !(await isParticipant(message.conversationId, me.id))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const headers = { "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" };

  if (message.attachmentRef.startsWith("blob:")) {
    try {
      return NextResponse.redirect(await viewingLink(message.attachmentRef), { status: 302, headers });
    } catch (e) {
      console.error("Chat attachment: couldn't issue a viewing link; streaming instead", e);
    }
  }
  const file = await readAttachment(message.attachmentRef, message.attachmentType);
  if (!file) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(file.body as BodyInit, { headers: { ...headers, "Content-Type": file.contentType } });
}
