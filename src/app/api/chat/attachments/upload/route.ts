import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { authorize } from "@/lib/auth";
import { CHAT_ROLES, isParticipant } from "@/lib/chat";
import { attachmentStorage, conversationFolder, uploadConstraints } from "@/lib/chat-attachments";

/**
 * Issues the browser a short-lived token to upload a chat photo or video straight to the private
 * Blob store. `clientPayload` is the conversation; the token only allows that conversation's folder,
 * photo and video types, and their size limit. Only members of the conversation get one.
 */
export async function POST(req: Request) {
  if (attachmentStorage() !== "blob") return NextResponse.json({ error: "Attachments are stored locally here." }, { status: 404 });
  const me = await authorize(...CHAT_ROLES);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      request: req,
      body,
      token: process.env.BLOB_PRIVATE_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const conversationId = clientPayload ?? "";
        if (!conversationId || !(await isParticipant(conversationId, me.id))) throw new Error("Not a member of this conversation.");
        if (!pathname.startsWith(conversationFolder(conversationId)) || pathname.includes("..")) throw new Error("Wrong folder.");
        const { token: _token, ...limits } = uploadConstraints();
        return limits;
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload refused." }, { status: 400 });
  }
}
