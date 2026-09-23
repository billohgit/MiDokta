/** Currency used for all billing. ISO 4217 code (SLE = Sierra Leonean Leone). */
export const CURRENCY = "SLE";

const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: CURRENCY,
  currencyDisplay: "code",
  minimumFractionDigits: 2,
});

export const formatMoney = (amount: number | string) => formatter.format(Number(amount));

export const formatInvoiceNumber = (n: number) => `INV-${String(n).padStart(6, "0")}`;

/** Rounds to cents to avoid floating-point drift when summing on the client. */
export const roundMoney = (n: number) => Math.round(n * 100) / 100;
