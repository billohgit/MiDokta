import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { CALL_ROLES } from "@/lib/roles";
import { callName, expireStaleCalls, joinUrl } from "@/lib/calls";
import { toCallState } from "@/lib/call-state";

/**
 * GET /api/calls/:id — the call's state from the viewer's side. Polled by the call screen, which
 * also marks the viewer as still on the call.
 *   ?join=1   also return the viewer's room URL (with their own meeting token) once it's answered
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await authorize(...CALL_ROLES);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.call.findUnique({ where: { id }, select: { callerId: true, calleeId: true } });
  if (!existing || (existing.callerId !== me.id && existing.calleeId !== me.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const seen = existing.callerId === me.id ? { callerSeenAt: new Date() } : { calleeSeenAt: new Date() };
  await prisma.call.update({ where: { id }, data: seen });
  await expireStaleCalls(me.id);

  const call = await prisma.call.findUniqueOrThrow({ where: { id }, include: { caller: true, callee: true } });
  let url: string | null = null;
  if (req.nextUrl.searchParams.get("join") === "1" && call.status === "ACCEPTED") {
    try {
      // Doctors own the room, so they can remove anyone who shouldn't be there.
      url = await joinUrl(call, { name: callName(me), isOwner: me.role === "DOCTOR" });
    } catch (e) {
      console.error("Minting meeting token failed", e);
      return NextResponse.json({ error: "The call couldn't be connected. Try again." }, { status: 502 });
    }
  }
  return NextResponse.json({ call: toCallState(call, me.id), url }, { headers: { "Cache-Control": "no-store" } });
}
