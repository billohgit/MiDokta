import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import CallPage from "@/components/calls/CallPage";

export const dynamic = "force-dynamic";

export default async function DoctorCallPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireUser(Role.DOCTOR), params]);
  return <CallPage user={user} id={id} basePath="/doctor" />;
}
