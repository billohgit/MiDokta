import InvoiceDetailPage from "@/components/billing/InvoiceDetailPage";

export const dynamic = "force-dynamic";

export default async function AdminInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceDetailPage id={id} basePath="/admin" canVoid />;
}
