import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import InvoiceDetailPage from "@/components/billing/InvoiceDetailPage";

export const dynamic = "force-dynamic";

export default async function StaffInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [, { id }] = await Promise.all([requireUser(Role.RECEPTIONIST), params]);
  // Voiding stays with admins.
  return <InvoiceDetailPage id={id} basePath="/staff" />;
}
