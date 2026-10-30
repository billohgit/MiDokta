import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { runScheduledSms } from "@/lib/sms/scheduled";
import { syncPendingCheckouts } from "@/lib/payments";
import { expireStaleCalls } from "@/lib/calls";
import { syncPayouts } from "@/lib/payouts";
import { syncPharmacyOrders } from "@/lib/pharmacy";

/**
 * Scheduled SMS (appointment reminders, follow-ups, doctors' daily schedule). Also settles online
 * payments whose webhook never arrived, confirms delivered pharmacy orders nobody disputed, retries
 * and checks payouts and refunds, and closes video calls nobody hung up (texting missed calls).
 * Call every 15–60 minutes from a scheduler with:  Authorization: Bearer <CRON_SECRET>
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });

  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sms = await runScheduledSms();
  const payments = await syncPendingCheckouts();
  const pharmacy = await syncPharmacyOrders();
  const payouts = await syncPayouts();
  await expireStaleCalls();
  return NextResponse.json({ ok: true, ...sms, payments, pharmacy, payouts });
}

export const GET = handle;
export const POST = handle;
