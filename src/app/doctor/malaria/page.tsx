import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import CaseBoard from "@/components/malaria/CaseBoard";

export const dynamic = "force-dynamic";

/** Doctors follow every malaria case: test results, treatment plans and completion. */
export default async function MalariaCasesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [, { tab }] = await Promise.all([requireUser(Role.DOCTOR), searchParams]);
  return <CaseBoard basePath="/doctor" tab={tab} canScreen />;
}
