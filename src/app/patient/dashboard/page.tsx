import Link from "next/link";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { unreadMessageCount } from "@/lib/chat";
import { videoConfigured } from "@/lib/calls";
import { formatMoney } from "@/lib/money";
import { myDoctors, myUpcomingAppointments } from "@/lib/patient-portal";
import StatCard from "@/components/StatCard";
import UpcomingList from "@/components/patient-portal/UpcomingList";
import DoctorList from "@/components/patient-portal/DoctorList";

export const dynamic = "force-dynamic";

function greeting(now: Date) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function PatientDashboardPage() {
  const patient = await requireUser(Role.PATIENT);

  const [upcoming, doctors, unread, open, records] = await Promise.all([
    myUpcomingAppointments(patient.id),
    myDoctors(patient.id),
    unreadMessageCount(patient.id),
    prisma.invoice.findMany({
      where: { patientId: patient.id, status: { in: ["UNPAID", "PARTIAL"] } },
      select: { total: true, amountPaid: true },
    }),
    prisma.medicalRecord.count({ where: { patientId: patient.id } }),
  ]);
  const balance = open.reduce((sum, i) => sum + Number(i.total) - Number(i.amountPaid), 0);
  const canCall = videoConfigured();

  const stats = [
    { label: "Upcoming visits", value: upcoming.length, icon: "fa-calendar-check" },
    { label: "Balance due", value: formatMoney(balance), icon: "fa-wallet" },
    { label: "Unread messages", value: unread, icon: "fa-comments" },
    { label: "Visit records", value: records, icon: "fa-notes-medical" },
  ];

  return (
    <>
      <section className="card welcome-card">
        <div>
          <p className="welcome-greeting">{greeting(new Date())},</p>
          <h2 className="welcome-name">
            {patient.firstName} {patient.lastName}
          </h2>
          <p className="welcome-meta">
            {canCall
              ? "When your doctor calls, this screen rings. Keep Mi Dokta open around the time of your video visit."
              : "Your appointments, bills and messages in one place."}
          </p>
        </div>
        <i className="fa-solid fa-heart-pulse welcome-icon" aria-hidden="true" />
      </section>

      <section className="stats">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </section>

      {balance > 0 && (
        <Link href="/patient/billing" className="card pay-reminder">
          <i className="fa-solid fa-mobile-screen" />
          <span>
            <strong>You have {formatMoney(balance)} to pay.</strong> Pay now with Orange Money, Afrimoney or card.
          </span>
          <i className="fa-solid fa-chevron-right" />
        </Link>
      )}

      <div className="patient-home">
        <section>
          <div className="appt-header">
            <h2 className="section-heading">Upcoming</h2>
            <Link href="/patient/appointments" className="small-link">
              All appointments
            </Link>
          </div>
          <UpcomingList appointments={upcoming.slice(0, 3)} canCall={canCall} />
        </section>
        <section className="card calls-card">
          <h3 className="calls-title">Your doctors</h3>
          <DoctorList doctors={doctors} canCall={canCall} />
        </section>
      </div>
    </>
  );
}
