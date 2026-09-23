import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { upcomingEvents } from "@/lib/appointments";
import StatCard from "@/components/StatCard";
import Calendar from "@/components/Calendar";
import UpcomingEvents from "@/components/UpcomingEvents";

export const dynamic = "force-dynamic";

function greeting(now: Date) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function DoctorDashboardPage() {
  const doctor = await requireUser(Role.DOCTOR);
  const mine = { doctorId: doctor.id };

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const [hospital, today, pending, openRequests, upcomingCount, completed, patients, upcoming] = await Promise.all([
    doctor.hospitalId ? prisma.hospital.findUnique({ where: { id: doctor.hospitalId } }) : null,
    prisma.appointment.count({
      where: { ...mine, startsAt: { gte: startOfDay, lt: endOfDay }, status: { in: ["CONFIRMED", "COMPLETED"] } },
    }),
    prisma.appointment.count({ where: { ...mine, status: "PENDING" } }),
    prisma.appointment.count({ where: { doctorId: null, status: "PENDING" } }),
    prisma.appointment.count({ where: { ...mine, status: "CONFIRMED", startsAt: { gte: now } } }),
    prisma.appointment.count({ where: { ...mine, status: "COMPLETED" } }),
    prisma.appointment.findMany({
      where: { ...mine, status: { in: ["CONFIRMED", "COMPLETED"] } },
      distinct: ["patientId"],
      select: { patientId: true },
    }),
    upcomingEvents(mine),
  ]);

  const stats = [
    { label: "Today", value: today, icon: "fa-calendar-day" },
    { label: "Requests", value: pending + openRequests, icon: "fa-inbox" },
    { label: "Upcoming", value: upcomingCount, icon: "fa-calendar-check" },
    { label: "Completed", value: completed, icon: "fa-circle-check" },
    { label: "My Patients", value: patients.length, icon: "fa-bed-pulse" },
  ];

  return (
    <>
      <section className="card welcome-card">
        <div>
          <p className="welcome-greeting">{greeting(now)},</p>
          <h2 className="welcome-name">
            Dr. {doctor.firstName} {doctor.lastName}
          </h2>
          <p className="welcome-meta">
            {[doctor.specialty, hospital?.name].filter(Boolean).join(" · ") || "Complete your profile in Settings"}
          </p>
        </div>
        <i className="fa-solid fa-stethoscope welcome-icon" aria-hidden="true" />
      </section>

      <section className="stats">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </section>

      <section className="bottom">
        <Calendar />
        <UpcomingEvents events={upcoming} />
      </section>
    </>
  );
}
