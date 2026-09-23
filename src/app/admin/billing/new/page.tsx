import NewInvoicePage from "@/components/billing/NewInvoicePage";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ patient?: string; appointment?: string }> };

export default function AdminNewInvoicePage({ searchParams }: Props) {
  return <NewInvoicePage basePath="/admin" searchParams={searchParams} />;
}
