/**
 * What Omega sends back to the patient's browser. Shared by the server and the browser, so it holds
 * no server code.
 */

/** The languages Omega talks in: English, Sierra Leone Krio and French. */
export const OMEGA_LANGUAGES = [
  { id: "en", label: "English", speech: "en-GB" },
  { id: "kri", label: "Krio", speech: "en-GB" },
  { id: "fr", label: "Français", speech: "fr-FR" },
] as const;
export type OmegaLanguage = (typeof OMEGA_LANGUAGES)[number]["id"];
export const isOmegaLanguage = (v: unknown): v is OmegaLanguage => OMEGA_LANGUAGES.some((l) => l.id === v);

/**
 * Something Omega offers to do for the patient. Nothing happens until the patient taps Confirm;
 * the browser then runs the same action as the app's own buttons (booking, cancelling, adding to
 * the cart, messaging), with all its usual checks.
 */
export type OmegaProposal =
  | {
      kind: "book";
      doctorId: string;
      doctorName: string;
      specialty: string | null;
      /** YYYY-MM-DD and HH:MM, the patient's local time. */
      date: string;
      time: string;
      whenLabel: string;
      visitType: "IN_PERSON" | "VIDEO_CALL";
      reason: string;
      /** The doctor's fee, formatted; paid online after confirming. Null: free. */
      fee: string | null;
      /** For a refund account prefilled on the card. */
      phone: string | null;
    }
  | { kind: "cancel"; appointmentId: string; label: string; paid: boolean }
  | { kind: "cart"; productId: string; name: string; pharmacy: string; price: string; quantity: number; prescriptionOnly: boolean }
  | { kind: "message"; doctorId: string; doctorName: string; text: string };

export type OmegaLink = { label: string; href: string };

export type OmegaHospital = {
  name: string;
  kind: "hospital" | "clinic" | "pharmacy";
  lat: number;
  lng: number;
  distanceKm: number;
  address: string | null;
  phone: string | null;
  emergency: boolean;
  onMiDokta: boolean;
  directionsUrl: string;
};

export type OmegaReply =
  | {
      kind: "reply";
      text: string;
      hospitals?: OmegaHospital[];
      proposals?: OmegaProposal[];
      links?: OmegaLink[];
      /** Asks the app to start something itself, such as the malaria check's questions. */
      action?: "malaria-check";
      /** True when the AI was unavailable and Omega answered from its built-in replies. */
      basic?: boolean;
    }
  /** Omega needs the patient's location to answer: ask the browser for it and send again. */
  | { kind: "needs-location" };
