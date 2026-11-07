import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { CHAT_ROLES, isParticipant } from "@/lib/chat";
import { attachmentStorage, saveLocalAttachment } from "@/lib/chat-attachments";

/** Development only (no private Blob store): takes a chat attachment and keeps it on local disk. */
export async function POST(req: Request) {
  if (attachmentStorage() !== "local") return NextResponse.json({ error: "Not available." }, { status: 404 });
  const me = await authorize(...CHAT_ROLES);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const conversationId = String(form?.get("conversationId") ?? "");
  const file = form?.get("file");
  if (!(file instanceof File) || !conversationId || !(await isParticipant(conversationId, me.id))) {
    return NextResponse.json({ error: "Upload refused." }, { status: 400 });
  }
  const ref = await saveLocalAttachment(conversationId, file);
  if (!ref) return NextResponse.json({ error: "Send a photo or video within the size limit." }, { status: 400 });
  return NextResponse.json({ ref });
}
