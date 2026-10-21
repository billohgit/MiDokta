import { Role } from "@prisma/client";
import PortalShell from "@/components/PortalShell";
import type { NavItem } from "@/components/Sidebar";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { topbarUser } from "@/lib/people";
import { unreadMessageCount } from "@/lib/chat";
import OmegaAssistant from "@/components/omega/OmegaAssistant";
import MedicationReminders from "@/components/omega/MedicationReminders";

export const dynamic = "force-dynamic";

const NAV: NavItem[] = [
  { href: "/patient/dashboard", label: "home", icon: "fa-house-medical" },
  { href: "/patient/appointments", label: "appointments", icon: "fa-calendar-plus" },
  { href: "/patient/calls", label: "videoCalls", icon: "fa-video" },
  { href: "/patient/billing", label: "billsPayments", icon: "fa-file-invoice-dollar" },
  { href: "/patient/chat", label: "messages", icon: "fa-comments" },
  { href: "/patient/records", label: "myRecords", icon: "fa-notes-medical" },
  { href: "/patient/settings", label: "myProfile", icon: "fa-gear" },
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
      {/* Omega, the AI assistant, and its spoken medication reminders: patients only. */}
      <OmegaAssistant firstName={patient.firstName} />
      <MedicationReminders firstName={patient.firstName} />
    </PortalShell>
  );
}
