import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import InventoryPage from "@/components/inventory/InventoryPage";

export const dynamic = "force-dynamic";

export default async function StaffInventoryPage() {
  await requireUser(Role.PHARMACIST);
  return <InventoryPage canDelete={false} />;
}
