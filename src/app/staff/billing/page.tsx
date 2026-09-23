import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import BillingPage from "@/components/billing/BillingPage";

export const dynamic = "force-dynamic";

export default async function StaffBillingPage() {
  await requireUser(Role.RECEPTIONIST);
  return <BillingPage basePath="/staff" />;
}
