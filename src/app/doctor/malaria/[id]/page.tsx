import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import CaseDetail from "@/components/malaria/CaseDetail";

export const dynamic = "force-dynamic";

export default async function MalariaCasePage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireUser(Role.DOCTOR), params]);
  return <CaseDetail id={id} user={user} basePath="/doctor" />;
}
