import "server-only";

import { prisma } from "@/lib/prisma";

export type RatingSummary = { average: number; count: number };

/** Average stars and number of ratings for each doctor; doctors with no ratings are left out. */
export async function ratingSummaries(doctorIds?: string[]): Promise<Map<string, RatingSummary>> {
  const rows = await prisma.doctorRating.groupBy({
    by: ["doctorId"],
    where: doctorIds ? { doctorId: { in: doctorIds } } : undefined,
    _avg: { stars: true },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.doctorId, { average: r._avg.stars ?? 0, count: r._count._all }]));
}

export async function ratingSummary(doctorId: string): Promise<RatingSummary | null> {
  return (await ratingSummaries([doctorId])).get(doctorId) ?? null;
}

/** The patient's completed visits that have a doctor, newest first, with any rating they gave. */
export function ratableVisits(patientId: string, take: number) {
  return prisma.appointment.findMany({
    where: { patientId, status: "COMPLETED", doctorId: { not: null } },
    orderBy: { startsAt: "desc" },
    take,
    select: {
      id: true,
      title: true,
      startsAt: true,
      doctor: { select: { firstName: true, lastName: true } },
      rating: { select: { stars: true, comment: true } },
    },
  });
}
