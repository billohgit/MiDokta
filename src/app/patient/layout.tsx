import { Role } from "@prisma/client";
import PortalShell from "@/components/PortalShell";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { topbarUser } from "@/lib/people";
import { unreadMessageCount } from "@/lib/chat";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/patient/dashboard", label: "Home", icon: "fa-house-medical" },
  { href: "/patient/appointments", label: "Appointments", icon: "fa-calendar-plus" },
  { href: "/patient/calls", label: "Video Calls", icon: "fa-video" },
  { href: "/patient/billing", label: "Bills & Payments", icon: "fa-file-invoice-dollar" },
  { href: "/patient/chat", label: "Messages", icon: "fa-comments" },
  { href: "/patient/records", label: "My Records", icon: "fa-notes-medical" },
  { href: "/patient/settings", label: "My Profile", icon: "fa-gear" },
];

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const patient = await requireUser(Role.PATIENT);
  const [chatUnread, unpaid] = await Promise.all([
    unreadMessageCount(patient.id),
    prisma.invoice.count({ where: { patientId: patient.id, status: { in: ["UNPAID", "PARTIAL"] } } }),
  ]);

  return (
    <PortalShell
      nav={NAV}
      basePath="/patient"
      initialChatUnread={chatUnread}
      badges={{ "/patient/billing": unpaid }}
      user={topbarUser(patient)}
      calls
    >
      {children}
    </PortalShell>
  );
}
