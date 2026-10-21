"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, DICTIONARIES, type Locale } from "@/lib/i18n/dictionaries";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Set once in the root layout from the language cookie, so pages render in the right language from the start. */
export default function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);

/** UI text in the visitor's language, for client components. */
export const useDictionary = () => DICTIONARIES[useLocale()];
