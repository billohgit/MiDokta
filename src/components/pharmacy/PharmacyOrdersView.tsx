"use client";

import { resolveDispute, updatePharmacyOrder } from "@/app/actions/pharmacy";
import useServerAction from "@/components/ui/useServerAction";
import { ORDER_STATUS_CLASS, type OrderRow, statusLabel } from "./shared";

type Props = {
  orders: OrderRow[];
  /** "pharmacy" moves orders along; "admin" settles disputes. */
  as: "pharmacy" | "admin";
  empty: string;
};

/** Orders as cards, with the next step for whoever is looking: the pharmacy, or an admin. */
export default function PharmacyOrdersView({ orders, as, empty }: Props) {
  const { busy, error, run } = useServerAction();

  if (orders.length === 0) return <div className="empty-banner">{empty}</div>;

  return (
    <div className={`order-list${busy ? " is-busy" : ""}`}>
      {error && <p className="form-error page-error">{error}</p>}
      {orders.map((o) => {
        const pickup = o.fulfilment === "PICKUP";
        return (
          <article key={o.id} className="card order-card">
            <header className="my-invoice-head">
              <div>
                <h3>
                  {o.number} · {o.total}
                </h3>
                <p className="section-sub">
                  {o.createdAt} · {o.patient} · {o.contactPhone}
                  {as === "admin" && ` · ${o.pharmacy}`}
                </p>
              </div>
              <span className={`status-pill ${ORDER_STATUS_CLASS[o.status]}`}>{statusLabel(o.status, o.fulfilment)}</span>
            </header>
            <ul className="order-lines">
              {o.lines.map((l, i) => (
                <li key={i}>
                  <span>
                    {l.quantity} × {l.name}
                  </span>
                  <span>{l.amount}</span>
                </li>
              ))}
            </ul>
            <p className="form-note">
              {pickup ? (
                <>
                  <i className="fa-solid fa-store" /> Pickup
                </>
              ) : (
                <>
                  <i className="fa-solid fa-truck" /> Deliver to {o.deliveryAddress}
                </>
              )}{" "}
              · {as === "pharmacy" ? `you receive ${o.share}` : `pharmacy share ${o.share}`}
            </p>
            {o.note && <p className="pay-status">{o.status === "DISPUTED" ? `Patient reports: "${o.note}"` : o.note}</p>}

            <div className="row-actions">
              {as === "pharmacy" && o.status === "PAID" && (
                <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run(() => updatePharmacyOrder(o.id, "dispatch"))}>
                  {pickup ? "Ready to collect" : "Sent out for delivery"}
                </button>
              )}
              {as === "pharmacy" && o.status === "DISPATCHED" && (
                <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run(() => updatePharmacyOrder(o.id, "deliver"))}>
                  {pickup ? "Patient collected it" : "Delivered"}
                </button>
              )}
              {as === "pharmacy" && (o.status === "PAID" || o.status === "DISPATCHED") && (
                <button
                  className="btn btn-sm btn-outline"
                  disabled={busy}
                  onClick={() => {
                    const reason = window.prompt("Cancel this order and refund the patient in full? Tell them why:", "Out of stock");
                    if (reason !== null) run(() => updatePharmacyOrder(o.id, "cancel", reason));
                  }}
                >
                  Cancel and refund
                </button>
              )}
              {as === "admin" && o.status === "DISPUTED" && (
                <>
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={busy}
                    onClick={() => run(() => resolveDispute(o.id, "pay"), { confirm: `The patient did get ${o.number}: pay the pharmacy ${o.share}?` })}
                  >
                    Patient got it: pay pharmacy
                  </button>
                  <button
                    className="btn btn-sm btn-outline"
                    disabled={busy}
                    onClick={() => run(() => resolveDispute(o.id, "refund"), { confirm: `The patient didn't get ${o.number}: refund them ${o.total}?` })}
                  >
                    Not received: refund patient
                  </button>
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
