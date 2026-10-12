/**
 * Turns a prescription's free-text frequency ("Twice daily", "TDS", "1-0-1", "every 8 hours")
 * and duration ("5 days", "3 months") into the times of day a patient should take it.
 * Pure functions, shared by the server (Omega's answers) and the browser (spoken reminders).
 */

export type DoseSlot = "morning" | "midday" | "evening" | "night";

/** Local clock time each dose slot is announced at, in the patient's own time zone. */
export const DOSE_TIMES: Record<DoseSlot, { hour: number; minute: number; label: string }> = {
  morning: { hour: 8, minute: 0, label: "morning" },
  midday: { hour: 13, minute: 0, label: "midday" },
  evening: { hour: 18, minute: 0, label: "evening" },
  night: { hour: 21, minute: 0, label: "night" },
};

export const SLOT_ORDER: DoseSlot[] = ["morning", "midday", "evening", "night"];

const BY_COUNT: Record<number, DoseSlot[]> = {
  1: ["morning"],
  2: ["morning", "night"],
  3: ["morning", "midday", "night"],
  4: ["morning", "midday", "evening", "night"],
};

const WORD_NUMBERS: Record<string, number> = {
  one: 1, once: 1, two: 2, twice: 2, three: 3, thrice: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/**
 * The dose slots for a frequency, in the order of the day. Empty when the medicine has no fixed
 * daily times: taken as needed, weekly, or written in a way we can't read.
 */
export function doseSlots(frequency: string): DoseSlot[] {
  const f = frequency.toLowerCase().replace(/×/g, "x").trim();
  if (!f) return [];
  if (/\b(prn|sos|stat|as needed|when needed|if needed|as required|when required)\b/.test(f)) return [];
  if (/\b(week|weekly|month|monthly|alternate days|every other day)\b/.test(f)) return [];

  // Dose grid: 1-0-1 is morning, midday, night; 1-1-1-1 adds the evening.
  const grid = f.match(/^(\d+(?:\/\d)?)\s*-\s*(\d+(?:\/\d)?)\s*-\s*(\d+(?:\/\d)?)(?:\s*-\s*(\d+(?:\/\d)?))?$/);
  if (grid) {
    const slots: DoseSlot[] = grid[4] !== undefined ? ["morning", "midday", "evening", "night"] : ["morning", "midday", "night"];
    return slots.filter((_, i) => grid[i + 1] !== "0");
  }

  const hours = f.match(/\b(?:every|q)\s*(\d+)\s*(?:h|hr|hrs|hour|hours|hourly)\b/);
  if (hours) {
    const n = Number(hours[1]);
    if (n >= 24) return BY_COUNT[1];
    if (n >= 12) return BY_COUNT[2];
    if (n >= 8) return BY_COUNT[3];
    return BY_COUNT[4];
  }

  let count: number | undefined;
  const numeric = f.match(/\b(\d+)\s*(?:x|times)\b/) ?? f.match(/\bx\s*(\d+)\b/);
  if (numeric) count = Number(numeric[1]);
  else {
    // "two tablets three times a day": the count is the number before "times", not the first number.
    const word = f.match(/\b(once|twice|thrice)\b/) ?? f.match(/\b(one|two|three|four|five|six)\s+times\b/);
    if (word) count = WORD_NUMBERS[word[1]];
  }
  if (count === undefined) {
    if (/\b(qds|qid)\b/.test(f)) count = 4;
    else if (/\b(tds|tid)\b/.test(f)) count = 3;
    else if (/\b(bd|bid)\b/.test(f)) count = 2;
    else if (/\b(od|qd|daily|a day|per day|every day|each day|nocte|mane|hs|at night|bedtime|in the morning)\b/.test(f)) count = 1;
  }
  if (count === undefined || count < 1) return [];

  if (count === 1) {
    if (/\b(night|nocte|hs|bedtime|before bed|evening)\b/.test(f)) return /\bevening\b/.test(f) ? ["evening"] : ["night"];
    if (/\b(midday|noon|lunch|afternoon)\b/.test(f)) return ["midday"];
    return ["morning"];
  }
  return BY_COUNT[Math.min(count, 4)];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };

/** How long a course lasts, in days. Null when ongoing; undefined when it can't be read. */
export function durationDays(duration: string): number | null | undefined {
  const d = duration.toLowerCase().trim();
  if (/\b(ongoing|continuous|continue|long[- ]term|indefinite|lifelong|for life|chronic|until further notice)\b/.test(d)) return null;
  const match = d.match(/(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(day|week|month|year)s?\b/);
  if (!match) return undefined;
  const n = Number(match[1]) || WORD_NUMBERS[match[1]];
  return Math.round(n * UNIT_DAYS[match[2]]);
}

/** Courses whose duration we can't read are treated as lasting this long, so reminders still stop. */
export const UNKNOWN_COURSE_DAYS = 30;

/**
 * When a course ends: the start plus its duration. Null for ongoing medicines. The start is the day
 * the pharmacy handed it over, or the consultation date when it wasn't dispensed through the app.
 */
export function courseEnd(start: Date, duration: string): Date | null {
  const days = durationDays(duration);
  if (days === null) return null;
  return new Date(start.getTime() + (days ?? UNKNOWN_COURSE_DAYS) * DAY_MS);
}
