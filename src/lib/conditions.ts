/**
 * Common illnesses patients name when they register, with the words they use for them, the kinds of
 * doctor who usually treat them, and medicines commonly used. Used to suggest doctors and medicines
 * on the patient's dashboard. It is general guidance, not a diagnosis or a prescription:
 * `otc: false` medicines are prescription-only, so patients are pointed to a doctor, not the cart.
 *
 * Specialties are matched against doctors' free-typed specialty, so they're word stems.
 */

export type ConditionMedicine = { name: string; otc: boolean; note?: string };

export type Condition = {
  name: string;
  /** Lowercase words and phrases patients use for it, including common misspellings. */
  synonyms: string[];
  specialties: string[];
  medicines: ConditionMedicine[];
};

const GENERAL = ["general", "family", "internal"];
const PARACETAMOL: ConditionMedicine = { name: "Paracetamol", otc: true, note: "for fever and pain" };

export const CONDITIONS: Condition[] = [
  {
    name: "Malaria",
    synonyms: ["malaria", "malaira", "maleria", "fever and chills"],
    specialties: [...GENERAL, "infectious", "paediatric", "pediatric"],
    medicines: [{ name: "Artemether-lumefantrine", otc: false, note: "after a malaria test" }, PARACETAMOL],
  },
  {
    name: "Typhoid",
    synonyms: ["typhoid", "typhoid fever", "tyfoid"],
    specialties: [...GENERAL, "infectious"],
    medicines: [{ name: "Ciprofloxacin", otc: false }, { name: "Azithromycin", otc: false }, PARACETAMOL],
  },
  {
    name: "High blood pressure",
    synonyms: ["high blood pressure", "hypertension", "high bp", "bp", "blood pressure", "pressure"],
    specialties: [...GENERAL, "cardio"],
    medicines: [{ name: "Amlodipine", otc: false }, { name: "Hydrochlorothiazide", otc: false }, { name: "Lisinopril", otc: false }],
  },
  {
    name: "Diabetes",
    synonyms: ["diabetes", "diabetic", "sugar", "sugar disease", "high blood sugar"],
    specialties: [...GENERAL, "endocrin", "diabet"],
    medicines: [{ name: "Metformin", otc: false }, { name: "Glibenclamide", otc: false }],
  },
  {
    name: "Asthma",
    synonyms: ["asthma", "athsma", "asma", "wheezing"],
    specialties: [...GENERAL, "pulmon", "chest", "respir"],
    medicines: [{ name: "Salbutamol", otc: false, note: "inhaler" }],
  },
  {
    name: "Pneumonia",
    synonyms: ["pneumonia", "neumonia", "chest infection"],
    specialties: [...GENERAL, "pulmon", "chest", "respir", "paediatric", "pediatric"],
    medicines: [{ name: "Amoxicillin", otc: false }, PARACETAMOL],
  },
  {
    name: "Cough, cold or flu",
    synonyms: ["cough", "cold", "flu", "catarrh", "running nose", "runny nose", "sore throat"],
    specialties: [...GENERAL],
    medicines: [PARACETAMOL, { name: "Cough syrup", otc: true }, { name: "Vitamin C", otc: true }],
  },
  {
    name: "Diarrhoea",
    synonyms: ["diarrhoea", "diarrhea", "diarhea", "running stomach", "runny stomach", "loose stool", "cholera"],
    specialties: [...GENERAL, "paediatric", "pediatric", "gastro"],
    medicines: [{ name: "ORS", otc: true, note: "oral rehydration salts" }, { name: "Zinc", otc: true, note: "for children" }],
  },
  {
    name: "Urinary tract infection",
    synonyms: ["urinary tract infection", "uti", "urine infection", "burning urine", "painful urination"],
    specialties: [...GENERAL, "urolog", "gynae", "gyneco"],
    medicines: [{ name: "Nitrofurantoin", otc: false }, { name: "Ciprofloxacin", otc: false }],
  },
  {
    name: "Stomach ulcer or gastritis",
    synonyms: ["ulcer", "stomach ulcer", "gastritis", "heartburn", "acid", "indigestion", "stomach pain"],
    specialties: [...GENERAL, "gastro"],
    medicines: [{ name: "Antacid", otc: true }, { name: "Omeprazole", otc: false }],
  },
  {
    name: "Headache or body pain",
    synonyms: ["headache", "head ache", "migraine", "body pain", "pain"],
    specialties: [...GENERAL, "neuro"],
    medicines: [PARACETAMOL, { name: "Ibuprofen", otc: true }],
  },
  {
    name: "Joint pain or arthritis",
    synonyms: ["arthritis", "joint pain", "rheumatism", "back pain", "knee pain"],
    specialties: [...GENERAL, "rheumat", "ortho"],
    medicines: [{ name: "Ibuprofen", otc: true }, { name: "Diclofenac", otc: true, note: "gel" }],
  },
  {
    name: "Skin infection or rash",
    synonyms: ["skin infection", "rash", "ringworm", "fungal", "eczema", "itching", "scabies"],
    specialties: [...GENERAL, "derma"],
    medicines: [{ name: "Clotrimazole", otc: true, note: "cream, for fungal infections" }],
  },
  {
    name: "Worms",
    synonyms: ["worms", "worm", "intestinal worms", "deworming"],
    specialties: [...GENERAL, "paediatric", "pediatric"],
    medicines: [{ name: "Albendazole", otc: true }],
  },
  {
    name: "Anaemia",
    synonyms: ["anaemia", "anemia", "low blood", "low hb"],
    specialties: [...GENERAL, "haemat", "hemat"],
    medicines: [{ name: "Ferrous sulphate", otc: true, note: "iron" }, { name: "Folic acid", otc: true }],
  },
  {
    name: "Pregnancy care",
    synonyms: ["pregnancy", "pregnant", "antenatal", "prenatal"],
    specialties: ["obstet", "gynae", "gyneco", "midwi"],
    medicines: [{ name: "Folic acid", otc: true }, { name: "Ferrous sulphate", otc: true, note: "iron" }],
  },
  {
    name: "Sickle cell disease",
    synonyms: ["sickle cell", "sickler", "scd"],
    specialties: [...GENERAL, "haemat", "hemat"],
    medicines: [{ name: "Folic acid", otc: true }, PARACETAMOL],
  },
  {
    name: "Allergy",
    synonyms: ["allergy", "allergies", "hay fever", "allergic"],
    specialties: [...GENERAL],
    medicines: [{ name: "Cetirizine", otc: true }, { name: "Chlorphenamine", otc: true }],
  },
  {
    name: "Eye problem",
    synonyms: ["eye", "eye infection", "apollo", "conjunctivitis", "red eye", "poor sight"],
    specialties: ["ophthalm", "eye"],
    medicines: [{ name: "Chloramphenicol", otc: false, note: "eye drops" }],
  },
  // Treated through specialist programmes: doctors only, no shop medicines.
  { name: "HIV", synonyms: ["hiv", "aids"], specialties: [...GENERAL, "infectious"], medicines: [] },
  { name: "Tuberculosis", synonyms: ["tuberculosis", "tb"], specialties: [...GENERAL, "pulmon", "chest", "infectious"], medicines: [] },
  {
    name: "Mental health",
    synonyms: ["depression", "anxiety", "stress", "mental health", "insomnia", "can't sleep"],
    specialties: ["psychiat", "mental", ...GENERAL],
    medicines: [],
  },
];

const normal = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The condition a patient's own words name, or null. Whole-word matching, longest phrase first, so
 * "high blood pressure" wins over "pressure" and "stomach ulcer" over "ulcer".
 */
export function matchCondition(words: string | null | undefined): Condition | null {
  const text = ` ${normal(words ?? "")} `;
  if (text.trim() === "") return null;
  let best: { condition: Condition; length: number } | null = null;
  for (const condition of CONDITIONS) {
    for (const s of condition.synonyms) {
      if (text.includes(` ${s} `) && (!best || s.length > best.length)) best = { condition, length: s.length };
    }
  }
  return best?.condition ?? null;
}
