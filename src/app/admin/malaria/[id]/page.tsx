import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import CaseDetail from "@/components/malaria/CaseDetail";

export const dynamic = "force-dynamic";

/** Admins see a case read-only: results and plans are recorded by doctors and nurses. */
export default async function MalariaCasePage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireUser(Role.ADMIN), params]);
  return <CaseDetail id={id} user={user} basePath="/admin" />;
}
