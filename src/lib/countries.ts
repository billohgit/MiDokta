/** Country calling codes offered in phone inputs: every African country, then common diaspora ones. */
export type Country = { iso: string; name: string; code: string };

const AFRICA: Country[] = [
  { iso: "DZ", name: "Algeria", code: "213" },
  { iso: "AO", name: "Angola", code: "244" },
  { iso: "BJ", name: "Benin", code: "229" },
  { iso: "BW", name: "Botswana", code: "267" },
  { iso: "BF", name: "Burkina Faso", code: "226" },
  { iso: "BI", name: "Burundi", code: "257" },
  { iso: "CV", name: "Cabo Verde", code: "238" },
  { iso: "CM", name: "Cameroon", code: "237" },
  { iso: "CF", name: "Central African Republic", code: "236" },
  { iso: "TD", name: "Chad", code: "235" },
  { iso: "KM", name: "Comoros", code: "269" },
  { iso: "CG", name: "Congo", code: "242" },
  { iso: "CD", name: "Congo (DRC)", code: "243" },
  { iso: "CI", name: "Côte d'Ivoire", code: "225" },
  { iso: "DJ", name: "Djibouti", code: "253" },
  { iso: "EG", name: "Egypt", code: "20" },
  { iso: "GQ", name: "Equatorial Guinea", code: "240" },
  { iso: "ER", name: "Eritrea", code: "291" },
  { iso: "SZ", name: "Eswatini", code: "268" },
  { iso: "ET", name: "Ethiopia", code: "251" },
  { iso: "GA", name: "Gabon", code: "241" },
  { iso: "GM", name: "Gambia", code: "220" },
  { iso: "GH", name: "Ghana", code: "233" },
  { iso: "GN", name: "Guinea", code: "224" },
  { iso: "GW", name: "Guinea-Bissau", code: "245" },
  { iso: "KE", name: "Kenya", code: "254" },
  { iso: "LS", name: "Lesotho", code: "266" },
  { iso: "LR", name: "Liberia", code: "231" },
  { iso: "LY", name: "Libya", code: "218" },
  { iso: "MG", name: "Madagascar", code: "261" },
  { iso: "MW", name: "Malawi", code: "265" },
  { iso: "ML", name: "Mali", code: "223" },
  { iso: "MR", name: "Mauritania", code: "222" },
  { iso: "MU", name: "Mauritius", code: "230" },
  { iso: "MA", name: "Morocco", code: "212" },
  { iso: "MZ", name: "Mozambique", code: "258" },
  { iso: "NA", name: "Namibia", code: "264" },
  { iso: "NE", name: "Niger", code: "227" },
  { iso: "NG", name: "Nigeria", code: "234" },
  { iso: "RW", name: "Rwanda", code: "250" },
  { iso: "ST", name: "São Tomé and Príncipe", code: "239" },
  { iso: "SN", name: "Senegal", code: "221" },
  { iso: "SC", name: "Seychelles", code: "248" },
  { iso: "SL", name: "Sierra Leone", code: "232" },
  { iso: "SO", name: "Somalia", code: "252" },
  { iso: "ZA", name: "South Africa", code: "27" },
  { iso: "SS", name: "South Sudan", code: "211" },
  { iso: "SD", name: "Sudan", code: "249" },
  { iso: "TZ", name: "Tanzania", code: "255" },
  { iso: "TG", name: "Togo", code: "228" },
  { iso: "TN", name: "Tunisia", code: "216" },
  { iso: "UG", name: "Uganda", code: "256" },
  { iso: "ZM", name: "Zambia", code: "260" },
  { iso: "ZW", name: "Zimbabwe", code: "263" },
];

const OTHER: Country[] = [
  { iso: "CA", name: "Canada", code: "1" },
  { iso: "CN", name: "China", code: "86" },
  { iso: "FR", name: "France", code: "33" },
  { iso: "DE", name: "Germany", code: "49" },
  { iso: "IN", name: "India", code: "91" },
  { iso: "LB", name: "Lebanon", code: "961" },
  { iso: "AE", name: "United Arab Emirates", code: "971" },
  { iso: "GB", name: "United Kingdom", code: "44" },
  { iso: "US", name: "United States", code: "1" },
];

export const COUNTRY_GROUPS = [
  { label: "Africa", countries: AFRICA },
  { label: "Other", countries: OTHER },
];

export const COUNTRIES = [...AFRICA, ...OTHER];

/** Joins a chosen calling code with a typed number; a number typed in international form wins. */
export function withCountryCode(code: string, number: string) {
  const n = number.trim();
  if (n.startsWith("+") || n.startsWith("00")) return n;
  return `+${code.replace(/\D/g, "")} ${n.replace(/^0+/, "")}`;
}
