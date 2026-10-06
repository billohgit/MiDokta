"use client";

import { useEffect } from "react";
import Logo from "@/components/Logo";

/**
 * Shown when a page fails to render, in place of Next's bare "This page couldn't load".
 * Most failures here are passing (a database waking up, a dropped connection), so retrying
 * usually works; the reference matches the error in the server logs.
 */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="login-page">
      <div className="card login-card call-notice">
        <div className="login-brand">
          <Logo stacked tagline />
        </div>
        <h1>Something went wrong</h1>
        <p className="login-sub">This page didn&apos;t load. It&apos;s usually temporary, so please try again.</p>
        <button type="button" className="btn btn-primary" onClick={() => retry()}>
          Try again
        </button>
        {error.digest && <p className="login-sub">Reference: {error.digest}</p>}
      </div>
    </main>
  );
}
