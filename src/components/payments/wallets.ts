import type { MobileWallet } from "@prisma/client";

/** The accounts money can be sent to (refunds, and doctors' and pharmacies' payouts), for pickers. */
export const WALLET_OPTIONS: { value: MobileWallet; label: string }[] = [
  { value: "ORANGE_MONEY", label: "Orange Money" },
  { value: "AFRIMONEY", label: "Afrimoney" },
  { value: "QMONEY", label: "QMoney" },
  { value: "TENKIPAY", label: "TenkiPay wallet" },
];
