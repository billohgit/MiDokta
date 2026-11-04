import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import TestDetail from "@/components/followups/TestDetail";

export const dynamic = "force-dynamic";

export default async function TestPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireUser(Role.NURSE, Role.RECEPTIONIST), params]);
  return <TestDetail id={id} user={user} basePath="/staff" />;
}
