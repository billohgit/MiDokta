import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import NotificationsPage from "@/components/notifications/NotificationsPage";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  return <NotificationsPage user={await requireUser(Role.ADMIN)} />;
}
