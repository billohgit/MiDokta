"use client";

import { useEffect, useState } from "react";
import LoginForm from "./LoginForm";
import PatientLoginForm from "./PatientLoginForm";

type Who = "patient" | "staff";

const REMEMBER_KEY = "mi-dokta-login-as";

/** Patients sign in with a texted code or email and password; doctors and staff with their password. */
export default function LoginTabs({ defaultCountry, initial }: { defaultCountry: string; initial: Who }) {
  const [who, setWho] = useState<Who>(initial);

  // Staff sign in on the same devices every day: reopen the tab last used on this one.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved === "patient" || saved === "staff") setWho(saved);
    } catch {
      // Storage blocked (private mode): keep the default.
    }
  }, []);

  const choose = (w: Who) => {
    setWho(w);
    try {
      localStorage.setItem(REMEMBER_KEY, w);
    } catch {
      // Not remembered; that's fine.
    }
  };

  return (
    <>
      <div className="segmented login-who" role="tablist" aria-label="I am a">
        {(["patient", "staff"] as const).map((w) => (
          <button key={w} type="button" role="tab" aria-selected={who === w} className={who === w ? "on" : undefined} onClick={() => choose(w)}>
            <i className={w === "patient" ? "fa-solid fa-user" : "fa-solid fa-user-doctor"} /> {w === "patient" ? "Patient" : "Doctor / Staff"}
          </button>
        ))}
      </div>
      {who === "patient" ? <PatientLoginForm defaultCountry={defaultCountry} /> : <LoginForm defaultCountry={defaultCountry} />}
    </>
  );
}
