import type { Fulfilment, PharmacyOrderStatus } from "@prisma/client";

/** What the patient sees for each order status; `delivery` differs from pickup for some. */
export const ORDER_STATUS_LABEL: Record<PharmacyOrderStatus, string> = {
  AWAITING_PAYMENT: "Waiting for payment",
  PAID: "Paid · being prepared",
  DISPATCHED: "On its way",
  DELIVERED: "Delivered",
  RECEIVED: "Received",
  DISPUTED: "Problem reported",
  CANCELLED: "Cancelled",
};

export const statusLabel = (status: PharmacyOrderStatus, fulfilment: Fulfilment) =>
  status === "DISPATCHED" && fulfilment === "PICKUP" ? "Ready to collect" : status === "DELIVERED" && fulfilment === "PICKUP" ? "Collected" : ORDER_STATUS_LABEL[status];

export const ORDER_STATUS_CLASS: Record<PharmacyOrderStatus, string> = {
  AWAITING_PAYMENT: "status-rejected",
  PAID: "status-pending",
  DISPATCHED: "status-pending",
  DELIVERED: "status-pending",
  RECEIVED: "status-confirmed",
  DISPUTED: "status-rejected",
  CANCELLED: "status-void",
};

/** A product as the shop shows it. Money arrives formatted. */
export type ShopProduct = {
  id: string;
  name: string;
  detail: string;
  description: string | null;
  price: string;
  inStock: number;
  pharmacyId: string;
  pharmacyName: string;
  pharmacyCity: string | null;
};

export type OrderLine = { name: string; quantity: number; amount: string };

/** An order as listed for a pharmacy or an admin. */
export type OrderRow = {
  id: string;
  number: string;
  status: PharmacyOrderStatus;
  fulfilment: Fulfilment;
  createdAt: string;
  patient: string;
  contactPhone: string;
  deliveryAddress: string | null;
  pharmacy: string;
  total: string;
  share: string;
  note: string | null;
  lines: OrderLine[];
};
