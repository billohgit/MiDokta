/**
 * Omega's malaria check: the questions, how the answers are scored, and the prevention tips.
 * Shared by the patient's browser (to ask the questions) and the server (which scores the answers
 * again, so the stored result can be trusted). No AI is involved in the scoring: it's a fixed,
 * reviewable rule.
 *
 * - Each symptom has a weight; the weights add up to 100. A score of 60 or more is a suspected case,
 *   referred for a malaria test.
 * - Any danger sign of severe malaria overrides the score: the patient is sent to a hospital now.
 *
 * The weights follow the usual clinical picture of uncomplicated malaria in an endemic area (fever
 * first, then chills and sweats, then the general symptoms). Have a clinician review them before
 * relying on the threshold.
 */

export const SUSPECT_THRESHOLD = 60;

export type SymptomQuestion = { id: string; text: string; weight: number };

export const SYMPTOMS: SymptomQuestion[] = [
  { id: "fever", text: "Do you have a fever, or have you felt hot, in the last two days?", weight: 25 },
  { id: "chills", text: "Have you had chills, shivering or heavy sweating?", weight: 15 },
  { id: "headache", text: "Do you have a headache?", weight: 10 },
  { id: "aches", text: "Do you have body, muscle or joint aches?", weight: 10 },
  { id: "nausea", text: "Have you felt sick, vomited, or lost your appetite?", weight: 10 },
  { id: "tired", text: "Do you feel unusually tired or weak?", weight: 10 },
  { id: "noNet", text: "In the last two weeks, have you slept without a treated mosquito net?", weight: 10 },
  { id: "contact", text: "Has someone you live with had malaria in the last month?", weight: 10 },
];

/** Signs of severe malaria: any one means hospital now, whatever the score. */
export const DANGER_SIGNS: { id: string; label: string }[] = [
  { id: "convulsions", label: "Fits or convulsions" },
  { id: "confusion", label: "Confused, very sleepy or hard to wake" },
  { id: "cannotDrink", label: "Can't drink or breastfeed, or vomits everything" },
  { id: "breathing", label: "Fast or difficult breathing" },
  { id: "darkUrine", label: "Very dark urine, or yellow eyes" },
  { id: "bleeding", label: "Unusual bleeding" },
  { id: "weakness", label: "Too weak to sit or stand" },
];

export const FOR_WHOM = [
  { id: "SELF", label: "Me" },
  { id: "CHILD", label: "A child under 5" },
  { id: "PREGNANT", label: "Me, and I'm pregnant" },
] as const;
export type ForWhom = (typeof FOR_WHOM)[number]["id"];

export const SL_DISTRICTS = [
  "Western Area Urban",
  "Western Area Rural",
  "Bo",
  "Bombali",
  "Bonthe",
  "Falaba",
  "Kailahun",
  "Kambia",
  "Karene",
  "Kenema",
  "Koinadugu",
  "Kono",
  "Moyamba",
  "Port Loko",
  "Pujehun",
  "Tonkolili",
] as const;

export type ScreeningAnswers = Record<string, boolean>;
export type Outcome = "LOW" | "SUSPECTED" | "DANGER";

export function scoreScreening(answers: ScreeningAnswers, dangerSigns: string[]): { score: number; outcome: Outcome } {
  const score = SYMPTOMS.reduce((sum, q) => sum + (answers[q.id] === true ? q.weight : 0), 0);
  const danger = dangerSigns.some((d) => DANGER_SIGNS.some((s) => s.id === d));
  return { score, outcome: danger ? "DANGER" : score >= SUSPECT_THRESHOLD ? "SUSPECTED" : "LOW" };
}

/** Prevention messages, one a week in turn (in the app and, when switched on, by SMS). */
export const PREVENTION_TIPS: string[] = [
  "Sleep under a treated mosquito net every night, the whole year round. Tuck it in under the mattress.",
  "Check your mosquito net for holes and mend them. A torn net lets mosquitoes in.",
  "Mosquitoes breed in standing water. Empty buckets, old tyres and pots, and cover water containers.",
  "Children under 5 and pregnant women catch malaria most easily. Make sure they sleep under a net first.",
  "Fever can be malaria. Get tested within 24 hours at a health centre: don't wait, and don't guess.",
  "If you are pregnant, go to your antenatal visits and take the malaria-prevention medicine the nurse gives you.",
  "Wear long sleeves and trousers in the evening, when mosquitoes bite most, and use repellent if you can.",
  "Close doors and windows at dusk, and use screens if you have them.",
  "When you get malaria medicine, take every dose for all the days, even if you feel better sooner.",
  "Allow the indoor spraying team into your home. Spraying kills the mosquitoes that carry malaria.",
  "Clear bushes and grass around your house, and fill in puddles where water collects.",
  "Danger signs need a hospital now: fits, confusion, very fast breathing, can't drink, or dark urine.",
];

/** The tip for the week containing `date`, the same for everyone. */
export function tipOfTheWeek(date = new Date()) {
  const week = Math.floor(date.getTime() / (7 * 86400_000));
  return { index: week % PREVENTION_TIPS.length, text: PREVENTION_TIPS[week % PREVENTION_TIPS.length] };
}

/** Plan templates a health worker can start from; doses follow the national guideline for ACTs. */
export const PLAN_TEMPLATES = [
  {
    label: "Artemether-lumefantrine (AL)",
    text: "Artemether-lumefantrine (AL), dose by body weight, twice a day for 3 days (6 doses). Take with food or milk. First two doses 8 hours apart.",
    days: 3,
    dosesPerDay: 2,
  },
  {
    label: "Artesunate-amodiaquine (ASAQ)",
    text: "Artesunate-amodiaquine (ASAQ), dose by age or weight, once a day for 3 days.",
    days: 3,
    dosesPerDay: 1,
  },
] as const;
