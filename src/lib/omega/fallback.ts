import "server-only";

import type { User } from "@prisma/client";
import { DOSE_TIMES } from "@/lib/medication-schedule";
import { tipOfTheWeek } from "@/lib/malaria/screening";
import { activeMedications } from "./medications";
import { nearestHospitals, type LatLng } from "./hospitals";
import { buildProposal, findMedicines, testsAndReferrals, upcomingAppointments } from "./data";
import type { OmegaLanguage, OmegaProposal, OmegaReply } from "./types";

/**
 * Omega's basic mode: when the AI can't be reached (no API key, no credit, an outage), Omega still
 * answers the common requests itself, in English, Krio or French. It recognises what the patient
 * wants from key words and answers from their own data; anything that changes something is offered
 * with a Confirm button, as in AI mode.
 *
 * The Krio texts are a first version: have a native speaker review them.
 */

type Ctx = { patient: User; location: LatLng | null; language: OmegaLanguage };

const T = {
  en: {
    basic: "I'm in basic mode right now, so I can help with a few things only.",
    help: "I can find the nearest hospital, tell you your medicines and appointments, show your test results, check you for malaria, help you cancel an appointment or reorder medicine, and open your messages. What would you like?",
    noMeds: "You have no current medicines from your doctors on MiDokta.",
    meds: (list: string) => `Your medicines: ${list}.`,
    noAppts: "You have no upcoming appointments.",
    appts: (list: string) => `Your upcoming appointments: ${list}.`,
    book: "To book, open Appointments and choose a doctor and time. In full mode I can book it for you.",
    cancelWhich: "Which appointment should I cancel? Tap Confirm on the one you want to cancel.",
    noTests: "You have no tests or referrals on MiDokta.",
    tests: (list: string) => `Your tests and referrals: ${list}.`,
    noHospitals: "I couldn't find hospitals near you. If it's an emergency, call your local emergency number.",
    hospitals: (name: string, km: number) => `The nearest is ${name}, about ${km} kilometres away. Tap Directions to go there.`,
    malaria: "Let's check for malaria. Answer the questions on screen.",
    tip: (tip: string) => `Malaria tip of the week: ${tip}`,
    reorder: "Here are your medicines in stock at MiDokta pharmacies. Tap Confirm to add one to your cart.",
    noStock: "I couldn't find your medicines in stock at MiDokta pharmacies right now. You can search the Pharmacy page.",
    message: "Open Messages to write to your doctor.",
    emergency: "This sounds like an emergency. Call your local emergency number or go to the nearest hospital now.",
    openAppointments: "Open Appointments",
    openMessages: "Open Messages",
    openPharmacy: "Open Pharmacy",
    openRecords: "Open My Records",
    ready: "result ready",
    and: " and ",
  },
  fr: {
    basic: "Je suis en mode simple pour le moment : je ne peux vous aider que pour quelques demandes.",
    help: "Je peux trouver l'hôpital le plus proche, vous dire vos médicaments et vos rendez-vous, montrer vos résultats d'analyses, faire un test du paludisme, vous aider à annuler un rendez-vous ou à recommander un médicament, et ouvrir vos messages. Que voulez-vous ?",
    noMeds: "Vous n'avez pas de médicaments en cours prescrits sur MiDokta.",
    meds: (list: string) => `Vos médicaments : ${list}.`,
    noAppts: "Vous n'avez pas de rendez-vous à venir.",
    appts: (list: string) => `Vos prochains rendez-vous : ${list}.`,
    book: "Pour prendre rendez-vous, ouvrez Rendez-vous et choisissez un médecin et une heure. En mode complet, je peux le faire pour vous.",
    cancelWhich: "Quel rendez-vous faut-il annuler ? Touchez Confirmer sur celui que vous voulez annuler.",
    noTests: "Vous n'avez ni analyses ni orientations sur MiDokta.",
    tests: (list: string) => `Vos analyses et orientations : ${list}.`,
    noHospitals: "Je n'ai pas trouvé d'hôpital près de vous. En cas d'urgence, appelez le numéro d'urgence local.",
    hospitals: (name: string, km: number) => `Le plus proche est ${name}, à environ ${km} kilomètres. Touchez Itinéraire pour y aller.`,
    malaria: "Faisons un test du paludisme. Répondez aux questions à l'écran.",
    tip: (tip: string) => `Conseil paludisme de la semaine : ${tip}`,
    reorder: "Voici vos médicaments en stock dans les pharmacies MiDokta. Touchez Confirmer pour en ajouter un au panier.",
    noStock: "Je n'ai pas trouvé vos médicaments en stock dans les pharmacies MiDokta. Vous pouvez chercher sur la page Pharmacie.",
    message: "Ouvrez Messages pour écrire à votre médecin.",
    emergency: "Cela ressemble à une urgence. Appelez le numéro d'urgence local ou allez tout de suite à l'hôpital le plus proche.",
    openAppointments: "Ouvrir Rendez-vous",
    openMessages: "Ouvrir Messages",
    openPharmacy: "Ouvrir Pharmacie",
    openRecords: "Ouvrir Mon dossier",
    ready: "résultat disponible",
    and: " et ",
  },
  kri: {
    basic: "A de na basic mode naw, so na smol tin dem a kin ep yu wit.",
    help: "A kin fen di ospitul we nia yu, tel yu yu meresin dem ɛn yu apointment dem, sho yu test rizult, chek yu fɔ malaria, ep yu kansul apointment ɔ bai meresin bak, ɛn opin yu mesej dem. Wetin yu want?",
    noMeds: "Yu nɔ gɛt meresin we yu dɔktɔ gi yu na MiDokta naw.",
    meds: (list: string) => `Yu meresin dem: ${list}.`,
    noAppts: "Yu nɔ gɛt apointment we de kam.",
    appts: (list: string) => `Yu apointment dem we de kam: ${list}.`,
    book: "Fɔ mek apointment, opin Appointments ɛn pik dɔktɔ ɛn di tɛm. Na di ful mode, a kin mek am fɔ yu.",
    cancelWhich: "Uswan apointment a fɔ kansul? Tap Confirm na di wan we yu want kansul.",
    noTests: "Yu nɔ gɛt test ɔ referral na MiDokta.",
    tests: (list: string) => `Yu test ɛn referral dem: ${list}.`,
    noHospitals: "A nɔ si ospitul nia yu. If na ɛmɛjɛnsi, kɔl di ɛmɛjɛnsi nɔmba.",
    hospitals: (name: string, km: number) => `Di wan we nia pas na ${name}, lɛk ${km} kilomita. Tap Directions fɔ go de.`,
    malaria: "Lɛ wi chek fɔ malaria. Ansa di kwɛshɔn dem na di skrin.",
    tip: (tip: string) => `Malaria tip fɔ dis wik: ${tip}`,
    reorder: "Dis na yu meresin dem we de na MiDokta famasi dem. Tap Confirm fɔ put wan na yu cart.",
    noStock: "A nɔ si yu meresin na MiDokta famasi dem naw. Yu kin luk na di Pharmacy pej.",
    message: "Opin Messages fɔ rayt to yu dɔktɔ.",
    emergency: "Dis tan lɛk ɛmɛjɛnsi. Kɔl di ɛmɛjɛnsi nɔmba ɔ go na di ospitul we nia yu naw naw.",
    openAppointments: "Opin Appointments",
    openMessages: "Opin Messages",
    openPharmacy: "Opin Pharmacy",
    openRecords: "Opin My Records",
    ready: "rizult dɔn rɛdi",
    and: " ɛn ",
  },
} as const;

// Key words in English, French and Krio. Order matters: the first match wins.
// Whole words only. \p{L} makes Krio letters (ɛ, ɔ) and French accents count as letters, which \b doesn't.
const w = (alternatives: string) => new RegExp(String.raw`(?<!\p{L})(${alternatives})(?!\p{L})`, "iu");
const INTENTS: [Intent, RegExp][] = [
  ["emergency", w(String.raw`emergency|urgence|ɛmɛjɛnsi|emejensi|can'?t breathe|chest pain|unconscious|fits?|convuls\p{L}*|seizures?|bleed\p{L}*`)],
  ["tip", w("tip|tips|prevent|prevention|prévention|prévenir|conseil|mosquito net|moustiquaire|net")],
  ["malaria", w("malaria|paludisme|palu|fever|fièvre|fiva|fɛva|chills?|frissons?|hot body|bɔdi at|body hot")],
  ["hospital", w("hospital|hospitals|clinic|clinique|hôpital|hopital|ospitul|ɔspitul|ospital|nearest|plus proche|nia")],
  ["cancel", w("cancel|annuler|annule|kansul|kansel")],
  ["book", w("book|booking|schedule|make an appointment|prendre rendez|réserver|reserver|mek apointment|want see doctor|si dɔktɔ")],
  ["reorder", w("reorder|re-order|refill|buy|order|commander|acheter|recommander|bai|cart|panier")],
  ["tests", w("test|tests|result|results|lab|résultat|resultat|analyse|analyses|rizult|referral|referrals|référ|orientation|specialist|spécialiste")],
  ["appointments", w("appointment|appointments|rendez-vous|rendez vous|rdv|apointment|visit|visite")],
  ["medicines", w("medicine|medicines|medication|pills?|tablets?|dose|médicament|médicaments|medicament|comprimé|traitement|meresin|mɛrɛsin|medsin|marasin")],
  ["message", w("message|messages|write to|talk to|écrire|parler|tɔk to|tok to|rayt")],
];
type Intent = "emergency" | "tip" | "malaria" | "hospital" | "cancel" | "book" | "reorder" | "tests" | "appointments" | "medicines" | "message" | "help";

export const detectIntent = (text: string): Intent => INTENTS.find(([, re]) => re.test(text))?.[0] ?? "help";

const list = (items: string[], and: string) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")}${and}${items.at(-1)}`);

export async function answerWithoutAI(text: string, ctx: Ctx): Promise<OmegaReply> {
  const t = T[ctx.language];
  const intent = detectIntent(text);
  const reply = (body: string, extra: Partial<Extract<OmegaReply, { kind: "reply" }>> = {}): OmegaReply => ({ kind: "reply", text: body, basic: true, ...extra });

  switch (intent) {
    case "emergency":
    case "hospital": {
      if (!ctx.location) return { kind: "needs-location" };
      const { hospitals } = await nearestHospitals(ctx.location, intent !== "emergency");
      const first = hospitals[0];
      const body = first ? t.hospitals(first.name, first.distanceKm) : t.noHospitals;
      return reply(intent === "emergency" ? `${t.emergency} ${body}` : body, { hospitals });
    }
    case "malaria":
      return reply(t.malaria, { action: "malaria-check" });
    case "tip":
      return reply(t.tip(tipOfTheWeek().text));
    case "medicines": {
      const meds = await activeMedications(ctx.patient.id);
      if (!meds.length) return reply(t.noMeds);
      const at = (slot: string) => {
        const d = DOSE_TIMES[slot as keyof typeof DOSE_TIMES];
        return d ? `${String(d.hour).padStart(2, "0")}:${String(d.minute).padStart(2, "0")}` : slot;
      };
      return reply(t.meds(list(meds.map((m) => `${m.medication} ${m.dosage}, ${m.frequency}${m.slots.length ? ` (${m.slots.map(at).join(", ")})` : ""}`), t.and)));
    }
    case "appointments": {
      const appts = await upcomingAppointments(ctx.patient.id);
      return reply(appts.length ? t.appts(list(appts.map((a) => `${a.label} (${a.status})`), t.and)) : t.noAppts, { links: [{ label: t.openAppointments, href: "/patient/appointments" }] });
    }
    case "book":
      return reply(t.book, { links: [{ label: t.openAppointments, href: "/patient/appointments" }] });
    case "cancel": {
      const appts = await upcomingAppointments(ctx.patient.id);
      if (!appts.length) return reply(t.noAppts);
      const proposals: OmegaProposal[] = appts.map((a) => ({ kind: "cancel", appointmentId: a.id, label: a.label, paid: a.paid }));
      return reply(t.cancelWhich, { proposals });
    }
    case "tests": {
      const { tests, referrals } = await testsAndReferrals(ctx.patient.id);
      if (!tests.length && !referrals.length) return reply(t.noTests);
      const items = [
        ...tests.map((x) => `${x.name}: ${x.status === "result ready" ? t.ready : x.status}${x.result ? `, ${x.result}` : ""}`),
        ...referrals.map((r) => `${r.specialty} (${r.to}): ${r.status}${r.appointment ? `, ${r.appointment}` : ""}`),
      ];
      return reply(t.tests(list(items, t.and)), { links: [{ label: t.openRecords, href: "/patient/records" }] });
    }
    case "reorder": {
      const meds = await activeMedications(ctx.patient.id);
      const proposals: OmegaProposal[] = [];
      for (const m of meds.slice(0, 4)) {
        const [product] = await findMedicines(m.medication.split(/\s+/)[0]);
        if (!product) continue;
        const built = await buildProposal(ctx.patient, { kind: "cart", product_id: product.id, quantity: 1 });
        if ("proposal" in built) proposals.push(built.proposal);
      }
      return reply(proposals.length ? t.reorder : t.noStock, { proposals, links: [{ label: t.openPharmacy, href: "/patient/pharmacy" }] });
    }
    case "message":
      return reply(t.message, { links: [{ label: t.openMessages, href: "/patient/chat" }] });
    default:
      return reply(`${t.basic} ${t.help}`);
  }
}
