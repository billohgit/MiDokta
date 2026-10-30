import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { toProfile } from "@/lib/people";
import { formatMoney } from "@/lib/money";
import { PLATFORM_FEE_RATE } from "@/lib/payouts";
import { formatDate } from "@/components/appointments/shared";
import ProfileSettings from "@/components/settings/ProfileSettings";
import ConsultationFeeSettings from "@/components/settings/ConsultationFeeSettings";

export const dynamic = "force-dynamic";

export default async function DoctorSettingsPage() {
  const doctor = await requireUser(Role.DOCTOR);
  const payouts = await prisma.payout.findMany({
    where: { recipientId: doctor.id, kind: "DOCTOR_SHARE" },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { consultation: { select: { startsAt: true, patient: { select: { firstName: true, lastName: true } } } } },
  });
  const paid = await prisma.payout.aggregate({ where: { recipientId: doctor.id, kind: "DOCTOR_SHARE", status: "COMPLETED" }, _sum: { amount: true } });

  return (
    <ProfileSettings profile={toProfile(doctor)}>
      <ConsultationFeeSettings
        fee={doctor.consultationFee?.toString() ?? null}
        wallet={doctor.payoutWallet}
        account={doctor.payoutAccount}
        platformPercent={PLATFORM_FEE_RATE.times(100).toString()}
        totalPaid={formatMoney((paid._sum.amount ?? new Prisma.Decimal(0)).toString())}
        earnings={payouts.map((p) => ({
          id: p.id,
          date: formatDate(p.consultation!.startsAt.toISOString()),
          patient: `${p.consultation!.patient.firstName} ${p.consultation!.patient.lastName}`,
          amount: formatMoney(p.amount.toString()),
          status: p.status,
          note: p.status === "PENDING" && !p.wallet ? "Waiting for your payout number" : null,
        }))}
      />
    </ProfileSettings>
  );
}
