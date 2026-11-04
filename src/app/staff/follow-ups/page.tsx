import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import FollowUpsBoard from "@/components/followups/FollowUpsBoard";

export const dynamic = "force-dynamic";

/** Nurses and receptionists follow every patient's tests and referrals. */
export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ tab?: string; show?: string }> }) {
  const [user, { tab, show }] = await Promise.all([requireUser(Role.NURSE, Role.RECEPTIONIST), searchParams]);
  return <FollowUpsBoard user={user} basePath="/staff" tab={tab} show={show} />;
}
