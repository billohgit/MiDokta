import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import FollowUpsBoard from "@/components/followups/FollowUpsBoard";

export const dynamic = "force-dynamic";

/** Admins see every test and referral. */
export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ tab?: string; show?: string }> }) {
  const [user, { tab, show }] = await Promise.all([requireUser(Role.ADMIN), searchParams]);
  return <FollowUpsBoard user={user} basePath="/admin" tab={tab} show={show} />;
}
