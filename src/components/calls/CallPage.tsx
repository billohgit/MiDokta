import { notFound } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toCallState } from "@/lib/call-state";
import CallScreen from "./CallScreen";

/** A call's screen for one of its two participants (server wrapper shared by the doctor and patient portals). */
export default async function CallPage({ user, id, basePath }: { user: User; id: string; basePath: string }) {
  const call = await prisma.call.findUnique({ where: { id }, include: { caller: true, callee: true } });
  if (!call || (call.callerId !== user.id && call.calleeId !== user.id)) notFound();

  return (
    <div className="call-page">
      <CallScreen key={call.id} initial={toCallState(call, user.id)} basePath={basePath} isDoctor={user.role === "DOCTOR"} />
    </div>
  );
}
