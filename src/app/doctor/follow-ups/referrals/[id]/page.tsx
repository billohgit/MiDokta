import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import ReferralDetail from "@/components/followups/ReferralDetail";

export const dynamic = "force-dynamic";

export default async function ReferralPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireUser(Role.DOCTOR), params]);
  return <ReferralDetail id={id} user={user} basePath="/doctor" />;
}
