"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/dictionaries";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Remember the visitor's language and re-render every page in it. */
export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { maxAge: ONE_YEAR, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}
