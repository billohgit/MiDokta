type Props = {
  /** Centre the logo (sign-in screens, print headers). */
  stacked?: boolean;
  /** The full logo with its taglines ("Care · Consult · Connect", "Your Digital Health Partner"). */
  tagline?: boolean;
};

/**
 * The MiDokta logo. The full logo carries its taglines; where space is tight (the sidebar) the
 * "MiDokta" wordmark alone is shown. Source: public/logo.jpeg, trimmed into logo.png and logo-wordmark.png.
 */
export default function Logo({ stacked = false, tagline = false }: Props) {
  return (
    <span className={`brand${stacked ? " brand-stacked" : ""}`}>
      {tagline ? (
        <img src="/logo.png" alt="MiDokta: Care, Consult, Connect. Your Digital Health Partner" className="brand-logo brand-logo-full" width={720} height={249} />
      ) : (
        <img src="/logo-wordmark.png" alt="MiDokta" className="brand-logo brand-logo-wordmark" width={560} height={111} />
      )}
    </span>
  );
}
