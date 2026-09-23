import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { upcomingEvents } from "@/lib/appointments";
import { formatMoney } from "@/lib/money";
import StatCard from "@/components/StatCard";
import Calendar from "@/components/Calendar";
import UpcomingEvents from "@/components/UpcomingEvents";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const [roleCounts, hospitals, upcoming, revenue] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], where: { isActive: true }, _count: { _all: true } }),
    prisma.hospital.count({ where: { isActive: true } }),
    upcomingEvents(),
    prisma.payment.aggregate({
      where: { paidAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
      _sum: { amount: true },
    }),
  ]);

  const count = (role: Role) => roleCounts.find((r) => r.role === role)?._count._all ?? 0;

  const stats = [
    { label: "Doctors", value: count(Role.DOCTOR), icon: "fa-user-doctor" },
    { label: "Nurses", value: count(Role.NURSE), icon: "fa-user-nurse" },
    { label: "Pharmacists", value: count(Role.PHARMACIST), icon: "fa-pills" },
    { label: "Admins", value: count(Role.ADMIN), icon: "fa-user-gear" },
    { label: "Receptionists", value: count(Role.RECEPTIONIST), icon: "fa-receipt" },
    { label: "Hospital", value: hospitals, icon: "fa-hospital" },
    { label: "Patients", value: count(Role.PATIENT), icon: "fa-bed-pulse" },
    { label: "Revenue (month)", value: formatMoney(Number(revenue._sum.amount ?? 0)), icon: "fa-sack-dollar" },
  ];

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
