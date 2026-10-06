"use client";

import { useEffect } from "react";

/** Last resort when the root layout itself fails; global styles aren't loaded here, so styles are inline. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f4f6f9", color: "#212529" }}>
        <title>Mi Dokta</title>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, maxWidth: 380, width: "100%", textAlign: "center", boxShadow: "0 2px 12px rgba(0,0,0,.08)" }}>
            <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Something went wrong</h1>
            <p style={{ color: "#6c757d", margin: "0 0 20px" }}>Mi Dokta didn&apos;t load. It&apos;s usually temporary, so please try again.</p>
            <button
              type="button"
              onClick={() => retry()}
              style={{ background: "#d32f2f", color: "#fff", border: 0, borderRadius: 8, padding: "10px 22px", fontSize: 16, cursor: "pointer" }}
            >
              Try again
            </button>
            {error.digest && <p style={{ color: "#adb5bd", fontSize: 12, marginTop: 20 }}>Reference: {error.digest}</p>}
          </div>
        </main>
      </body>
    </html>
  );
}
