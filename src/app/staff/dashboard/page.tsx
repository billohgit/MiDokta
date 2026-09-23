import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { upcomingEvents } from "@/lib/appointments";
import { formatMoney } from "@/lib/money";
import { lowStockCount } from "@/lib/stock";
import { STAFF_PORTAL_ROLES } from "@/lib/roles";
import StatCard from "@/components/StatCard";
import Calendar from "@/components/Calendar";
import UpcomingEvents from "@/components/UpcomingEvents";

export const dynamic = "force-dynamic";

export default async function StaffDashboardPage() {
  const staff = await requireUser(...STAFF_PORTAL_ROLES);

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const today = { startsAt: { gte: dayStart, lt: dayEnd } };

  const [todayCount, pending, patients, upcoming] = await Promise.all([
    prisma.appointment.count({ where: { ...today, status: { in: ["CONFIRMED", "COMPLETED"] } } }),
    prisma.appointment.count({ where: { status: "PENDING" } }),
    prisma.user.count({ where: { role: Role.PATIENT, isActive: true } }),
    upcomingEvents(),
  ]);

  const stats: { label: string; value: number | string; icon: string }[] = [
    { label: "Today", value: todayCount, icon: "fa-calendar-day" },
    { label: "Patients", value: patients, icon: "fa-bed-pulse" },
  ];

  if (staff.role === Role.RECEPTIONIST) {
    const [unpaid, collectedToday] = await Promise.all([
      prisma.invoice.aggregate({ where: { status: { in: ["UNPAID", "PARTIAL"] } }, _sum: { total: true, amountPaid: true } }),
      prisma.payment.aggregate({ where: { paidAt: { gte: dayStart } }, _sum: { amount: true } }),
    ]);
    const outstanding = Number(unpaid._sum.total ?? 0) - Number(unpaid._sum.amountPaid ?? 0);

    stats.splice(
      1,
      0,
      { label: "Requests", value: pending, icon: "fa-inbox" },
      { label: "Outstanding", value: formatMoney(outstanding), icon: "fa-file-invoice-dollar" },
      { label: "Collected Today", value: formatMoney(Number(collectedToday._sum.amount ?? 0)), icon: "fa-sack-dollar" }
    );
  } else if (staff.role === Role.PHARMACIST) {
    const [toDispense, dispensedToday, lowStock] = await Promise.all([
      prisma.prescription.count({ where: { dispensedAt: null } }),
      prisma.prescription.count({ where: { dispensedAt: { gte: dayStart } } }),
      lowStockCount(),
    ]);
    stats.splice(
      1,
      0,
      { label: "To Dispense", value: toDispense, icon: "fa-pills" },
      { label: "Dispensed Today", value: dispensedToday, icon: "fa-check-double" },
      { label: "Needs Reordering", value: lowStock, icon: "fa-triangle-exclamation" }
    );
  } else {
    const [upcomingCount, doctors] = await Promise.all([
      prisma.appointment.count({ where: { status: "CONFIRMED", startsAt: { gte: now } } }),
      prisma.user.count({ where: { role: Role.DOCTOR, isActive: true } }),
    ]);
    stats.splice(
      1,
      0,
      { label: "Upcoming", value: upcomingCount, icon: "fa-calendar-check" },
      { label: "Doctors", value: doctors, icon: "fa-user-doctor" }
    );
  }

  return (
    <>
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
