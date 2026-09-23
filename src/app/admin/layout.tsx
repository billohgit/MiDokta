import { Role } from "@prisma/client";
import PortalShell from "@/components/PortalShell";
import { requireUser } from "@/lib/auth";
import { topbarUser } from "@/lib/people";
import { unreadMessageCount } from "@/lib/chat";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "fa-table-cells-large" },
  { href: "/admin/appointments", label: "Appointments", icon: "fa-calendar-plus" },
  { href: "/admin/patients", label: "Patients", icon: "fa-bed-pulse" },
  { href: "/admin/doctors", label: "Doctors", icon: "fa-user-doctor" },
  { href: "/admin/staff", label: "Staff", icon: "fa-users" },
  { href: "/admin/hospitals", label: "Hospitals", icon: "fa-hospital" },
  { href: "/admin/inventory", label: "Pharmacy", icon: "fa-boxes-stacked" },
  { href: "/admin/billing", label: "Billing", icon: "fa-file-invoice-dollar" },
  { href: "/admin/chat", label: "Chat", icon: "fa-comments" },
  { href: "/admin/sms", label: "SMS", icon: "fa-comment-sms" },
  { href: "/admin/settings", label: "Settings", icon: "fa-gear" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireUser(Role.ADMIN);
  const chatUnread = await unreadMessageCount(admin.id);

  return (
    <PortalShell nav={NAV} basePath="/admin" initialChatUnread={chatUnread} user={topbarUser(admin)}>
      {children}
    </PortalShell>
  );
}
