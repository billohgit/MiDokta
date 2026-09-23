import BillingPage from "@/components/billing/BillingPage";

export const dynamic = "force-dynamic";

export default function AdminBillingPage() {
  return <BillingPage basePath="/admin" />;
}
