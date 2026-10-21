import { Role } from "@prisma/client";
import PortalShell from "@/components/PortalShell";
import type { NavItem } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";
import { topbarUser } from "@/lib/people";
import { unreadMessageCount } from "@/lib/chat";

export const dynamic = "force-dynamic";

const NAV: NavItem[] = [
  { href: "/doctor/dashboard", label: "dashboard", icon: "fa-table-cells-large" },
  { href: "/doctor/appointments", label: "appointments", icon: "fa-calendar-plus" },
  { href: "/doctor/patients", label: "patients", icon: "fa-bed-pulse" },
  { href: "/doctor/calls", label: "videoCalls", icon: "fa-video" },
  { href: "/doctor/chat", label: "chat", icon: "fa-comments" },
  { href: "/doctor/settings", label: "settings", icon: "fa-gear" },
];

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const doctor = await requireUser(Role.DOCTOR);
  const chatUnread = await unreadMessageCount(doctor.id);

  return (
    <PortalShell nav={NAV} basePath="/doctor" initialChatUnread={chatUnread} user={topbarUser(doctor)} calls>
      {children}
    </PortalShell>
  );
}
