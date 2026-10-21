"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setLocale } from "@/app/actions/locale";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/lib/i18n/dictionaries";
import { useDictionary, useLocale } from "./LocaleProvider";

/** Globe button that opens a menu to pick English or French. */
export default function LanguageSwitcher() {
  const locale = useLocale();
  const d = useDictionary();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (l: Locale) => {
    setOpen(false);
    if (l !== locale) startTransition(() => setLocale(l));
  };

  return (
    <div className="lang" ref={ref}>
      <button
        type="button"
        className="icon-btn lang-btn"
        aria-label={d.topbar.language}
        title={d.topbar.language}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
      >
        <i className={pending ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-globe"} />
        <span className="lang-code">{locale.toUpperCase()}</span>
      </button>
      {open && (
        <div className="lang-menu card" role="menu">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              role="menuitemradio"
              aria-checked={l === locale}
              lang={l}
              className={`lang-option${l === locale ? " on" : ""}`}
              onClick={() => choose(l)}
            >
              {LOCALE_NAMES[l]}
              {l === locale && <i className="fa-solid fa-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
