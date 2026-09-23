import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import NewInvoicePage from "@/components/billing/NewInvoicePage";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ patient?: string; appointment?: string }> };

export default async function StaffNewInvoicePage({ searchParams }: Props) {
  await requireUser(Role.RECEPTIONIST);
  return <NewInvoicePage basePath="/staff" searchParams={searchParams} />;
}
