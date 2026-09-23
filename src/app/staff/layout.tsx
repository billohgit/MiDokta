import { Role } from "@prisma/client";
import PortalShell from "@/components/PortalShell";
import type { NavItem } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";
import { topbarUser } from "@/lib/people";
import { unreadMessageCount } from "@/lib/chat";
import { STAFF_PORTAL_ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

const DASHBOARD = { href: "/staff/dashboard", label: "Dashboard", icon: "fa-table-cells-large" };
const PATIENTS = { href: "/staff/patients", label: "Patients", icon: "fa-bed-pulse" };
const COMMON = [
  { href: "/staff/chat", label: "Chat", icon: "fa-comments" },
  { href: "/staff/settings", label: "Settings", icon: "fa-gear" },
];

/** Nurses, pharmacists and receptionists share this portal; the pages differ by role. */
const NAV: Partial<Record<Role, NavItem[]>> = {
  [Role.RECEPTIONIST]: [
    DASHBOARD,
    { href: "/staff/appointments", label: "Appointments", icon: "fa-calendar-plus" },
    PATIENTS,
    { href: "/staff/billing", label: "Billing", icon: "fa-file-invoice-dollar" },
    ...COMMON,
  ],
  [Role.NURSE]: [DASHBOARD, { href: "/staff/schedule", label: "Schedule", icon: "fa-calendar-day" }, PATIENTS, ...COMMON],
  [Role.PHARMACIST]: [
    DASHBOARD,
    { href: "/staff/prescriptions", label: "Prescriptions", icon: "fa-pills" },
    { href: "/staff/inventory", label: "Stock", icon: "fa-boxes-stacked" },
    PATIENTS,
    ...COMMON,
  ],
};

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireUser(...STAFF_PORTAL_ROLES);
  const chatUnread = await unreadMessageCount(staff.id);

  return (
    <PortalShell nav={NAV[staff.role] ?? []} basePath="/staff" initialChatUnread={chatUnread} user={topbarUser(staff)}>
      {children}
    </PortalShell>
  );
}
