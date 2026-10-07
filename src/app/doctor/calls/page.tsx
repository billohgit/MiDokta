import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import CallHistory from "@/components/calls/CallHistory";

export const dynamic = "force-dynamic";

export default async function DoctorCallsPage() {
  return <CallHistory user={await requireUser(Role.DOCTOR)} basePath="/doctor" />;
}
