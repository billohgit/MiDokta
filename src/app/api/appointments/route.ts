import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/auth";
import { STAFF_PORTAL_ROLES } from "@/lib/roles";

// GET /api/appointments?from=ISO&to=ISO
// Doctors see only their own appointments; admins and staff see every one.
export async function GET(req: NextRequest) {
  const user = await authorize(Role.ADMIN, Role.DOCTOR, ...STAFF_PORTAL_ROLES);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const from = new Date(req.nextUrl.searchParams.get("from") ?? "");
  const to = new Date(req.nextUrl.searchParams.get("to") ?? "");
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: "from and to must be valid dates" }, { status: 400 });
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      startsAt: { gte: from, lt: to },
      status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
      ...(user.role === Role.DOCTOR ? { doctorId: user.id } : {}),
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, title: true, startsAt: true },
  });

  return NextResponse.json(appointments);
}
