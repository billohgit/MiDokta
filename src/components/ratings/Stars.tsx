/** "4.6" — one decimal place, as shown next to the stars. */
export const formatAverage = (average: number) => average.toFixed(1);

/** Read-only stars, filled to the nearest half. Works in server and client components. */
export default function Stars({ value, size }: { value: number; size?: "sm" }) {
  const halves = Math.round(value * 2);
  return (
    <span className={`stars${size ? ` stars-${size}` : ""}`} role="img" aria-label={`${formatAverage(value)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i
          key={n}
          aria-hidden="true"
          className={
            halves >= n * 2 ? "fa-solid fa-star" : halves === n * 2 - 1 ? "fa-solid fa-star-half-stroke" : "fa-regular fa-star"
          }
        />
      ))}
    </span>
  );
}
