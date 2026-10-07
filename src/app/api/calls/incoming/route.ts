import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { CALL_ROLES } from "@/lib/roles";
import { expireStaleCalls } from "@/lib/calls";
import { toParty } from "@/lib/call-state";

// GET /api/calls/incoming — the call ringing for the signed-in user right now, if any. Polled by every
// doctor and patient portal page so the call can ring wherever they are.
export async function GET() {
  const me = await authorize(...CALL_ROLES);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await expireStaleCalls(me.id);
  const call = await prisma.call.findFirst({
    where: { calleeId: me.id, status: "RINGING" },
    orderBy: { createdAt: "desc" },
    include: { caller: true },
  });
  return NextResponse.json(
    { call: call ? { id: call.id, from: toParty(call.caller) } : null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
