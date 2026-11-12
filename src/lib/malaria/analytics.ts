import "server-only";

import type { MalariaCase } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Aggregated malaria figures for program monitoring. Only counts leave this module: no names,
 * so the reports can be shared with the program and health authorities.
 */

export const MALARIA_PERIODS = { "30": "Last 30 days", "90": "Last 90 days", "365": "Last 12 months", all: "All time" } as const;
export type MalariaPeriod = keyof typeof MALARIA_PERIODS;

const DAY = 86400_000;
const UNKNOWN = "Not given";

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

type Counted = Pick<MalariaCase, "status" | "testedOn" | "testPositive" | "planApprovedAt" | "completedAt" | "treatmentEndsAt">;
function tally(cases: Counted[], now = new Date()) {
  const tested = cases.filter((c) => c.testedOn).length;
  const positive = cases.filter((c) => c.testPositive === true).length;
  const treated = cases.filter((c) => c.planApprovedAt).length;
  const completed = cases.filter((c) => c.status === "COMPLETED").length;
  // Completion is out of the treatments that have ended: someone on day 2 hasn't failed to complete.
  const ended = cases.filter((c) => c.planApprovedAt && (c.status === "COMPLETED" || c.status === "INCOMPLETE" || (c.treatmentEndsAt && c.treatmentEndsAt <= now))).length;
  return { cases: cases.length, tested, positive, treated, completed, positivity: pct(positive, tested), completion: pct(completed, ended) };
}

export async function malariaOverview(period: MalariaPeriod, now = new Date()) {
  const days = period === "all" ? null : Number(period);
  const since = days ? new Date(now.getTime() - days * DAY) : undefined;
  const before = days ? new Date(now.getTime() - 2 * days * DAY) : undefined;
  const range = since ? { gte: since } : undefined;

  const [screenings, cases, previousCases] = await Promise.all([
    prisma.malariaScreening.findMany({ where: { createdAt: range }, select: { outcome: true, district: true, forWhom: true, createdAt: true } }),
    prisma.malariaCase.findMany({ where: { createdAt: range } }),
    since && before ? prisma.malariaCase.findMany({ where: { createdAt: { gte: before, lt: since } }, select: { district: true } }) : Promise.resolve([]),
  ]);

  const t = tally(cases);
  const suspected = screenings.filter((s) => s.outcome !== "LOW").length;
  const danger = screenings.filter((s) => s.outcome === "DANGER").length;
  const hoursToTest = cases.filter((c) => c.testedOn).map((c) => (c.testedOn!.getTime() - c.createdAt.getTime()) / 3600_000);

  // The care cascade: each step as a share of the one before.
  const steps = [
    { label: "Malaria checks done", count: screenings.length },
    { label: "Suspected cases referred", count: cases.length },
    { label: "Tested", count: t.tested },
    { label: "Positive", count: t.positive },
    { label: "Started approved treatment", count: t.treated },
    { label: "Completed treatment", count: t.completed },
  ];
  const cascade = steps.map((s, i) => ({ ...s, ofPrevious: i === 0 ? null : pct(s.count, steps[i - 1].count) }));

  // Geography: by district, with the previous period for the trend.
  const districts = new Map<string, Counted[]>();
  for (const c of cases) districts.set(c.district ?? UNKNOWN, [...(districts.get(c.district ?? UNKNOWN) ?? []), c]);
  const prevByDistrict = new Map<string, number>();
  for (const c of previousCases) prevByDistrict.set(c.district ?? UNKNOWN, (prevByDistrict.get(c.district ?? UNKNOWN) ?? 0) + 1);
  const checksByDistrict = new Map<string, number>();
  for (const s of screenings) checksByDistrict.set(s.district ?? UNKNOWN, (checksByDistrict.get(s.district ?? UNKNOWN) ?? 0) + 1);
  const byDistrict = [...new Set([...districts.keys(), ...checksByDistrict.keys()])]
    .map((d) => ({ district: d, checks: checksByDistrict.get(d) ?? 0, ...tally(districts.get(d) ?? []), previous: since ? (prevByDistrict.get(d) ?? 0) : null }))
    .sort((a, b) => b.cases - a.cases || b.checks - a.checks);

  // The last 12 weeks, oldest first.
  const weekStart = (d: Date) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x;
  };
  const thisWeek = weekStart(now).getTime();
  const weeks = Array.from({ length: 12 }, (_, i) => ({ start: new Date(thisWeek - (11 - i) * 7 * DAY), checks: 0, suspected: 0, positive: 0 }));
  const [recentChecks, recentCases] = await Promise.all([
    prisma.malariaScreening.findMany({ where: { createdAt: { gte: weeks[0].start } }, select: { createdAt: true, outcome: true } }),
    prisma.malariaCase.findMany({ where: { testedOn: { gte: weeks[0].start }, testPositive: true }, select: { testedOn: true } }),
  ]);
  const weekOf = (d: Date) => weeks[Math.floor((weekStart(d).getTime() - weeks[0].start.getTime()) / (7 * DAY))];
  for (const s of recentChecks) {
    const w = weekOf(s.createdAt);
    if (!w) continue;
    w.checks++;
    if (s.outcome !== "LOW") w.suspected++;
  }
  for (const c of recentCases) {
    const w = weekOf(c.testedOn!);
    if (w) w.positive++;
  }

  return {
    totals: {
      checks: screenings.length,
      suspected,
      danger,
      children: screenings.filter((s) => s.forWhom === "CHILD").length,
      pregnant: screenings.filter((s) => s.forWhom === "PREGNANT").length,
      ...t,
      open: cases.filter((c) => ["REFERRED", "POSITIVE", "TREATMENT", "INCOMPLETE"].includes(c.status)).length,
      needsFollowUp: cases.filter((c) => c.status === "INCOMPLETE").length,
      medianHoursToTest: median(hoursToTest),
    },
    cascade,
    byDistrict,
    weeks,
  };
}

/** Per-facility counts for one month: where cases were referred and tested. */
export async function facilityReport(month: string) {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));
  const cases = await prisma.malariaCase.findMany({
    where: { OR: [{ createdAt: { gte: from, lt: to } }, { testedOn: { gte: from, lt: to } }] },
  });
  const rows = new Map<string, { facility: string; referred: number; tested: number; positive: number; negative: number; treated: number; completed: number; incomplete: number }>();
  const row = (name: string) => {
    if (!rows.has(name)) rows.set(name, { facility: name, referred: 0, tested: 0, positive: 0, negative: 0, treated: 0, completed: 0, incomplete: 0 });
    return rows.get(name)!;
  };
  const inMonth = (d: Date | null) => !!d && d >= from && d < to;
  for (const c of cases) {
    if (inMonth(c.createdAt)) row(c.facilityName ?? UNKNOWN).referred++;
    if (inMonth(c.testedOn)) {
      const r = row(c.testedAt ?? c.facilityName ?? UNKNOWN);
      r.tested++;
      if (c.testPositive) r.positive++;
      else r.negative++;
      if (c.planApprovedAt) r.treated++;
      if (c.status === "COMPLETED") r.completed++;
      if (c.status === "INCOMPLETE") r.incomplete++;
    }
  }
  const list = [...rows.values()].sort((a, b) => b.tested - a.tested || b.referred - a.referred);
  const total = list.reduce(
    (s, r) => ({
      facility: "All facilities",
      referred: s.referred + r.referred,
      tested: s.tested + r.tested,
      positive: s.positive + r.positive,
      negative: s.negative + r.negative,
      treated: s.treated + r.treated,
      completed: s.completed + r.completed,
      incomplete: s.incomplete + r.incomplete,
    }),
    { facility: "All facilities", referred: 0, tested: 0, positive: 0, negative: 0, treated: 0, completed: 0, incomplete: 0 },
  );
  return { month, rows: list, total };
}

export const REPORT_COLUMNS = [
  ["facility", "Facility"],
  ["referred", "Suspected cases referred"],
  ["tested", "Tested"],
  ["positive", "Positive"],
  ["negative", "Negative"],
  ["treated", "Started approved treatment"],
  ["completed", "Completed treatment"],
  ["incomplete", "Needs follow-up"],
] as const;

export function reportCsv(r: Awaited<ReturnType<typeof facilityReport>>) {
  const cell = (v: string | number) => (typeof v === "number" ? String(v) : `"${v.replace(/"/g, '""')}"`);
  const line = (o: Record<string, string | number>) => REPORT_COLUMNS.map(([k]) => cell(o[k])).join(",");
  return [REPORT_COLUMNS.map(([, h]) => cell(h)).join(","), ...r.rows.map(line), line(r.total)].join("\r\n") + "\r\n";
}

export const currentMonth = (now = new Date()) => now.toISOString().slice(0, 7);
export const isMonth = (s: unknown): s is string => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
