type Props = {
  /** Stack the mark above the wordmark (login screens, print headers). */
  stacked?: boolean;
  /** Show the "Care across Africa" strapline under the wordmark. */
  tagline?: boolean;
};

export default function Logo({ stacked = false, tagline = false }: Props) {
  return (
    <span className={`brand${stacked ? " brand-stacked" : ""}`}>
      <img src="/logo-mark.png" alt="" className="brand-logo" />
      <span className="brand-text">
        <span className="brand-name">
          <span className="brand-name-mi">Mi</span>Dokta
        </span>
        {tagline && <span className="brand-tagline">Care across Africa</span>}
      </span>
    </span>
  );
}
