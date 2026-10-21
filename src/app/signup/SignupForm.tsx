"use client";

import Link from "next/link";
import { type FormEvent, startTransition, useActionState, useState } from "react";
import { type SignupState, signup } from "@/app/actions/auth";
import { SIGNUP_ROLES } from "@/lib/roles";
import ImageCapture from "@/components/ui/ImageCapture";
import PhoneInput from "@/components/ui/PhoneInput";
import { useDictionary } from "@/components/i18n/LocaleProvider";

export default function SignupForm({ defaultCountry }: { defaultCountry: string }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(signup, {
    error: null,
    done: false,
    values: { firstName: "", lastName: "", email: "", country: defaultCountry, phone: "", role: "" },
  });
  const v = state.values;
  const [country, setCountry] = useState(v.country);
  const [photo, setPhoto] = useState<File | null>(null);
  const [idCard, setIdCard] = useState<File | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const d = useDictionary();

  // Submitted by hand rather than through <form action>: React resets a form after an action,
  // which would wipe the typed fields and the captured images whenever validation fails.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!photo || !idCard) return setMissing(!photo ? d.signup.addPhoto : d.signup.addIdCard);
    setMissing(null);
    const formData = new FormData(e.currentTarget);
    formData.set("photo", photo);
    formData.set("idCard", idCard);
    startTransition(() => action(formData));
  };

  if (state.done) {
    return (
      <>
        <h1>{d.signup.doneTitle}</h1>
        <p className="login-sub">
          {d.signup.doneBody(v.firstName)}{" "}
          {v.role === "PATIENT" ? d.signup.donePatient(v.email) : d.signup.doneOther(v.email)}
        </p>
        <Link href="/login" className="btn btn-primary login-btn">
          {d.signup.backToSignIn}
        </Link>
      </>
    );
  }

  const error = missing ?? state.error;

  return (
    <>
      <h1>{d.signup.title}</h1>
      <p className="login-sub">{d.signup.subtitle}</p>
      <form onSubmit={onSubmit} className="login-form">
        <div className="login-row">
          <label className="field">
            <span>{d.signup.firstName}</span>
            <input name="firstName" autoComplete="given-name" defaultValue={v.firstName} required autoFocus />
          </label>
          <label className="field">
            <span>{d.signup.lastName}</span>
            <input name="lastName" autoComplete="family-name" defaultValue={v.lastName} required />
          </label>
        </div>
        <label className="field">
          <span>{d.login.email}</span>
          <input type="email" name="email" autoComplete="email" defaultValue={v.email} required />
        </label>
        <div className="field">
          <label htmlFor="signup-phone">{d.login.phoneNumber}</label>
          <PhoneInput
            id="signup-phone"
            name="phone"
            country={country}
            onCountryChange={setCountry}
            defaultValue={v.phone}
            required
          />
          <small className="form-note">{d.signup.phoneNote}</small>
        </div>
        <label className="field">
          <span>{d.signup.iAmA}</span>
          <select name="role" defaultValue={v.role} required>
            <option value="" disabled>
              {d.signup.chooseRole}
            </option>
            {SIGNUP_ROLES.map((r) => (
              <option key={r} value={r}>
                {d.signup.roles[r]}
              </option>
            ))}
          </select>
        </label>
        <ImageCapture
          label={d.signup.photo}
          hint={d.signup.photoHint}
          mode="face"
          value={photo}
          onChange={setPhoto}
        />
        <ImageCapture
          label={d.signup.idCard}
          hint={d.signup.idCardHint}
          mode="card"
          value={idCard}
          onChange={setIdCard}
        />
        <label className="field">
          <span>{d.login.password}</span>
          <input type="password" name="password" autoComplete="new-password" minLength={8} required />
        </label>
        <label className="field">
          <span>{d.signup.confirmPassword}</span>
          <input type="password" name="confirmPassword" autoComplete="new-password" minLength={8} required />
        </label>
        <p className="form-note">
          <i className="fa-solid fa-lock" /> {d.signup.idPrivacy}
        </p>
        <label className="checkbox-line terms-accept">
          <input type="checkbox" name="acceptTerms" required />
          <span>
            {d.signup.agreeTo}{" "}
            <Link href="/terms" target="_blank">
              {d.login.terms}
            </Link>
          </span>
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? d.signup.creating : d.signup.create}
        </button>
      </form>
      <p className="login-alt">
        {d.signup.haveAccount} <Link href="/login">{d.signup.signIn}</Link>
      </p>
    </>
  );
}
