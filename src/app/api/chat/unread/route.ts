import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { CHAT_ROLES, unreadMessageCount } from "@/lib/chat";

// GET /api/chat/unread — total unread chat messages, for the sidebar badge.
export async function GET() {
  const me = await authorize(...CHAT_ROLES);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ unread: await unreadMessageCount(me.id) }, { headers: { "Cache-Control": "no-store" } });
}
