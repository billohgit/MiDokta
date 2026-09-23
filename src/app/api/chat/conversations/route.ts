import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { CHAT_ROLES, listConversations } from "@/lib/chat";

// GET /api/chat/conversations — the signed-in user's conversations with unread counts.
export async function GET() {
  const me = await authorize(...CHAT_ROLES);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ conversations: await listConversations(me.id) }, { headers: { "Cache-Control": "no-store" } });
}
