import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import CallHistory from "@/components/calls/CallHistory";

export const dynamic = "force-dynamic";

export default async function PatientCallsPage() {
  return <CallHistory user={await requireUser(Role.PATIENT)} basePath="/patient" />;
}
