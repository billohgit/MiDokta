"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Fulfilment, MobileWallet } from "@prisma/client";
import { checkout, setCartQuantity } from "@/app/actions/pharmacy";
import useServerAction from "@/components/ui/useServerAction";
import { WALLET_OPTIONS } from "@/components/payments/wallets";
import { formatMoney } from "@/lib/money";

export type CartLine = { productId: string; name: string; detail: string; imageUrl: string | null; unitPrice: number; quantity: number; inStock: number };

type Props = {
  lines: CartLine[];
  pharmacy: { name: string; address: string; deliveryFee: number | null } | null;
  phone: string | null;
  address: string | null;
};

/** The cart: change quantities, choose delivery or pickup, and place the order (then pay it). */
export default function CartView({ lines, pharmacy, phone, address }: Props) {
  const router = useRouter();
  const [fulfilment, setFulfilment] = useState<Fulfilment>(pharmacy?.deliveryFee != null ? "DELIVERY" : "PICKUP");
  const [wallet, setWallet] = useState<MobileWallet>("ORANGE_MONEY");
  const { busy, error, run, submitWith } = useServerAction();

  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const delivery = fulfilment === "DELIVERY" && pharmacy?.deliveryFee ? pharmacy.deliveryFee : 0;

  if (!pharmacy || lines.length === 0) {
    return (
      <div className="settings">
        <h2 className="section-heading">Your Cart</h2>
        <div className="empty-banner">
          Your cart is empty. <Link href="/patient/pharmacy">Browse the pharmacy</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`settings${busy ? " is-busy" : ""}`}>
      <Link href="/patient/pharmacy" className="back-link">
        <i className="fa-solid fa-arrow-left" /> Keep shopping
      </Link>
      <h2 className="section-heading">Your Cart</h2>
      <p className="section-sub">
        From <strong>{pharmacy.name}</strong>, {pharmacy.address}
      </p>

      <section className="card my-invoice">
        <ul className="pay-items cart-lines">
          {lines.map((l) => (
            <li key={l.productId}>
              <span className="product-cell">
                {l.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.imageUrl} alt="" className="product-thumb" />
                ) : (
                  <span className="product-thumb product-thumb-empty">
                    <i className="fa-solid fa-capsules" />
                  </span>
                )}
                <span>
                  <strong>{l.name}</strong>
                  {l.detail && <span className="section-sub"> {l.detail}</span>}
                  <br />
                  <span className="section-sub">{formatMoney(l.unitPrice)} each</span>
                </span>
              </span>
              <span className="cart-qty">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="One fewer"
                  disabled={busy}
                  onClick={() => run(() => setCartQuantity(l.productId, l.quantity - 1))}
                >
                  <i className={`fa-solid ${l.quantity === 1 ? "fa-trash" : "fa-minus"}`} />
                </button>
                <span>{l.quantity}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="One more"
                  disabled={busy || l.quantity >= l.inStock}
                  onClick={() => run(() => setCartQuantity(l.productId, l.quantity + 1))}
                >
                  <i className="fa-solid fa-plus" />
                </button>
                <strong className="cart-amount">{formatMoney(l.unitPrice * l.quantity)}</strong>
              </span>
            </li>
          ))}
          <li>
            <span>Medicines</span>
            <span>{formatMoney(subtotal)}</span>
          </li>
          {fulfilment === "DELIVERY" && (
            <li>
              <span>Delivery</span>
              <span>{formatMoney(delivery)}</span>
            </li>
          )}
          <li className="pay-total">
            <span>Total</span>
            <span>{formatMoney(subtotal + delivery)}</span>
          </li>
        </ul>
      </section>

      <form
        className="card my-invoice form-grid"
        onSubmit={submitWith(checkout, {
          onSuccess: (r) => {
            const id = (r as { payInvoiceId?: string }).payInvoiceId;
            if (id) router.push(`/patient/billing/${id}`);
          },
        })}
      >
        <fieldset className="field full">
          <span>How do you want it? *</span>
          <label className="checkbox-line">
            <input
              type="radio"
              name="fulfilment"
              value="DELIVERY"
              checked={fulfilment === "DELIVERY"}
              disabled={pharmacy.deliveryFee == null}
              onChange={() => setFulfilment("DELIVERY")}
            />{" "}
            Deliver to me {pharmacy.deliveryFee == null ? "(this pharmacy doesn't deliver)" : `(${formatMoney(pharmacy.deliveryFee)})`}
          </label>
          <label className="checkbox-line">
            <input type="radio" name="fulfilment" value="PICKUP" checked={fulfilment === "PICKUP"} onChange={() => setFulfilment("PICKUP")} /> I&apos;ll
            collect it from the pharmacy (free)
          </label>
        </fieldset>
        {fulfilment === "DELIVERY" && (
          <label className="field full">
            <span>Delivery address *</span>
            <textarea name="deliveryAddress" rows={2} maxLength={300} defaultValue={address ?? ""} required placeholder="House, street, area, landmark" />
          </label>
        )}
        <label className="field full">
          <span>Phone for the pharmacy to reach you *</span>
          <input name="contactPhone" type="tel" defaultValue={phone ?? ""} required />
        </label>
        <p className="form-note full">
          <i className="fa-solid fa-circle-info" /> You pay now. The pharmacy is paid only after you confirm you have your order. If it&apos;s
          cancelled before then, you get everything back to:
        </p>
        <label className="field">
          <span>Refund to *</span>
          <select name="refundWallet" value={wallet} onChange={(e) => setWallet(e.target.value as MobileWallet)}>
            {WALLET_OPTIONS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{wallet === "TENKIPAY" ? "Wallet number *" : "Mobile number *"}</span>
          <input name="refundAccount" defaultValue={phone ?? ""} required inputMode={wallet === "TENKIPAY" ? "text" : "tel"} />
        </label>
        {error && <p className="form-error full">{error}</p>}
        <div className="modal-actions full">
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? "Placing order..." : `Place order and pay ${formatMoney(subtotal + delivery)}`}
          </button>
        </div>
      </form>
    </div>
  );
}
