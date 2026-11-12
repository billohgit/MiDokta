import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { authorize } from "@/lib/auth";
import { currentMonth, facilityReport, isMonth, reportCsv } from "@/lib/malaria/analytics";

// GET /api/malaria/report?month=YYYY-MM — the month's facility report as CSV. Admins only.
export async function GET(req: Request) {
  const admin = await authorize(Role.ADMIN);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const asked = new URL(req.url).searchParams.get("month");
  const month = isMonth(asked) ? asked : currentMonth();
  const csv = reportCsv(await facilityReport(month));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="midokta-malaria-facilities-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
