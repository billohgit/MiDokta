import { Role } from "@prisma/client";
import PortalShell from "@/components/PortalShell";
import type { NavItem } from "@/components/Sidebar";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { topbarUser } from "@/lib/people";
import { unreadMessageCount } from "@/lib/chat";

export const dynamic = "force-dynamic";

const NAV: NavItem[] = [
  { href: "/admin/dashboard", label: "dashboard", icon: "fa-table-cells-large" },
  { href: "/admin/appointments", label: "appointments", icon: "fa-calendar-plus" },
  { href: "/admin/patients", label: "patients", icon: "fa-bed-pulse" },
  { href: "/admin/doctors", label: "doctors", icon: "fa-user-doctor" },
  { href: "/admin/staff", label: "staff", icon: "fa-users" },
  { href: "/admin/verifications", label: "verification", icon: "fa-id-card" },
  { href: "/admin/hospitals", label: "hospitals", icon: "fa-hospital" },
  { href: "/admin/inventory", label: "pharmacy", icon: "fa-boxes-stacked" },
  { href: "/admin/billing", label: "billing", icon: "fa-file-invoice-dollar" },
  { href: "/admin/chat", label: "chat", icon: "fa-comments" },
  { href: "/admin/sms", label: "sms", icon: "fa-comment-sms" },
  { href: "/admin/settings", label: "settings", icon: "fa-gear" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireUser(Role.ADMIN);
  const [chatUnread, awaitingApproval] = await Promise.all([
    unreadMessageCount(admin.id),
    prisma.user.count({ where: { isActive: false, verificationStatus: { not: null } } }),
  ]);

  return (
    <PortalShell
      nav={NAV}
      basePath="/admin"
      initialChatUnread={chatUnread}
      badges={{ "/admin/verifications": awaitingApproval }}
      user={topbarUser(admin)}
    >
      {children}
    </PortalShell>
  );
}
