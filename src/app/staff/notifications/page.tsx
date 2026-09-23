import { requireUser } from "@/lib/auth";
import { STAFF_PORTAL_ROLES } from "@/lib/roles";
import NotificationsPage from "@/components/notifications/NotificationsPage";

export const dynamic = "force-dynamic";

export default async function StaffNotificationsPage() {
  return <NotificationsPage user={await requireUser(...STAFF_PORTAL_ROLES)} />;
}
