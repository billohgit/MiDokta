import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import FollowUpsBoard from "@/components/followups/FollowUpsBoard";

export const dynamic = "force-dynamic";

/** Doctors see the tests they ordered and the referrals they made or received. */
export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ tab?: string; show?: string }> }) {
  const [user, { tab, show }] = await Promise.all([requireUser(Role.DOCTOR), searchParams]);
  return <FollowUpsBoard user={user} basePath="/doctor" tab={tab} show={show} />;
}
