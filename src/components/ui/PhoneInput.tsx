"use client";

import { COUNTRIES, COUNTRY_GROUPS } from "@/lib/countries";

type Props = {
  id: string;
  /** Name of the number field; the country is submitted as `country`. */
  name: string;
  country: string;
  onCountryChange: (iso: string) => void;
  defaultValue?: string;
  required?: boolean;
  autoFocus?: boolean;
};

/** A country calling-code picker followed by the national number. */
export default function PhoneInput({ id, name, country, onCountryChange, defaultValue, required, autoFocus }: Props) {
  const dial = COUNTRIES.find((c) => c.iso === country);

  return (
    <div className="phone-input">
      <div className="country-select">
        <span aria-hidden="true">
          {dial?.iso} +{dial?.code} <i className="fa-solid fa-chevron-down" />
        </span>
        <select name="country" aria-label="Country code" value={country} onChange={(e) => onCountryChange(e.target.value)}>
          {COUNTRY_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.countries.map((c) => (
                <option key={c.iso} value={c.iso}>
                  {c.name} (+{c.code})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <input
        id={id}
        type="tel"
        name={name}
        autoComplete="tel-national"
        inputMode="tel"
        placeholder="76 123 456"
        defaultValue={defaultValue}
        required={required}
        autoFocus={autoFocus}
      />
    </div>
  );
}
