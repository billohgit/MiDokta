import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, DICTIONARIES, LOCALE_COOKIE, type Locale, isLocale } from "./dictionaries";

/** The language the visitor picked, remembered in a cookie. */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** UI text in the visitor's language, for server components. */
export async function getDictionary() {
  return DICTIONARIES[await getLocale()];
}
