"use client";

import { useEffect, useState } from "react";

type Appt = { id: string; title: string; startsAt: string };

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default function Calendar() {
  // Set on mount so "today" uses the viewer's clock and timezone, not the server's.
  const [today, setToday] = useState<Date | null>(null);
  const [view, setView] = useState<{ year: number; month: number } | null>(null);
  const [appts, setAppts] = useState<Appt[]>([]);

  useEffect(() => {
    const now = new Date();
    setToday(now);
    setView({ year: now.getFullYear(), month: now.getMonth() });
  }, []);

  useEffect(() => {
    if (!view) return;
    const first = new Date(view.year, view.month, 1);
    const from = new Date(view.year, view.month, 1 - first.getDay());
    const to = new Date(view.year, view.month + 1, 7);
    const ctrl = new AbortController();
    fetch(`/api/appointments?from=${from.toISOString()}&to=${to.toISOString()}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then(setAppts)
      .catch(() => {});
    return () => ctrl.abort();
  }, [view]);

  const shift = (delta: number) =>
    setView((v) => {
      if (!v) return v;
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const byDay = new Map<string, Appt[]>();
  for (const a of appts) {
    const k = dayKey(new Date(a.startsAt));
    byDay.set(k, [...(byDay.get(k) ?? []), a]);
  }

  let days: Date[] = [];
  let monthLabel = " ";
  if (view) {
    const first = new Date(view.year, view.month, 1);
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const cells = Math.ceil((first.getDay() + daysInMonth) / 7) * 7;
    days = Array.from({ length: cells }, (_, i) => new Date(view.year, view.month, 1 - first.getDay() + i));
    monthLabel = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  const isCurrentMonth = !!today && !!view && view.year === today.getFullYear() && view.month === today.getMonth();

  return (
    <div className="card calendar-card">
      <div className="cal-head">
        <div>
          <h2 className="cal-title">Calendar</h2>
          <div className="cal-month">{monthLabel}</div>
        </div>
        <div className="cal-controls">
          <button
            className="btn-today"
            disabled={isCurrentMonth}
            onClick={() => today && setView({ year: today.getFullYear(), month: today.getMonth() })}
          >
            Today
          </button>
          <button className="btn-nav" onClick={() => shift(-1)} aria-label="Previous month">
            <i className="fa-solid fa-chevron-left" />
          </button>
          <button className="btn-nav" onClick={() => shift(1)} aria-label="Next month">
            <i className="fa-solid fa-chevron-right" />
          </button>
        </div>
      </div>

      <div className="cal-grid">
        {DOW.map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const k = dayKey(d);
          const cls = ["cal-day"];
          if (d.getMonth() !== view!.month) cls.push("other");
          if (today && k === dayKey(today)) cls.push("today");
          return (
            <div key={k} className={cls.join(" ")}>
              {d.getDate()}
              {byDay.get(k)?.map((a) => (
                <span key={a.id} className="cal-event" title={a.title}>
                  {new Date(a.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} {a.title}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
