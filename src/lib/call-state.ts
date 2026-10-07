import "server-only";

import type { Call, User } from "@prisma/client";
import { callName } from "@/lib/calls";
import type { CallParty, CallState } from "@/components/calls/types";

export const toParty = (u: User): CallParty => ({
  id: u.id,
  name: callName(u),
  firstName: u.firstName,
  lastName: u.lastName,
  avatarUrl: u.avatarUrl,
});

/** A call from `viewerId`'s side. */
export function toCallState(call: Call & { caller: User; callee: User }, viewerId: string): CallState {
  const side = call.callerId === viewerId ? "caller" : "callee";
  return {
    id: call.id,
    status: call.status,
    side,
    other: toParty(side === "caller" ? call.callee : call.caller),
    appointmentId: call.appointmentId,
    answeredAt: call.answeredAt?.toISOString() ?? null,
  };
}
