import { Role } from "@prisma/client";
import PortalShell from "@/components/PortalShell";
import { requireUser } from "@/lib/auth";
import { topbarUser } from "@/lib/people";
import { unreadMessageCount } from "@/lib/chat";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/doctor/dashboard", label: "Dashboard", icon: "fa-table-cells-large" },
  { href: "/doctor/appointments", label: "Appointments", icon: "fa-calendar-plus" },
  { href: "/doctor/patients", label: "Patients", icon: "fa-bed-pulse" },
  { href: "/doctor/chat", label: "Chat", icon: "fa-comments" },
  { href: "/doctor/settings", label: "Settings", icon: "fa-gear" },
];

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const doctor = await requireUser(Role.DOCTOR);
  const chatUnread = await unreadMessageCount(doctor.id);

  return (
    <PortalShell nav={NAV} basePath="/doctor" initialChatUnread={chatUnread} user={topbarUser(doctor)}>
      {children}
    </PortalShell>
  );
}
