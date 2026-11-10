"use client";

import { useState, useTransition } from "react";
import { addToCart } from "@/app/actions/pharmacy";

/** One-tap "Add to cart" for a suggested product; offers to start a new cart from another pharmacy. */
export default function AddToCartButton({ productId }: { productId: string }) {
  const [state, setState] = useState<"idle" | "added" | string>("idle");
  const [busy, start] = useTransition();

  const add = (replaceCart = false): void =>
    start(async () => {
      const r = await addToCart(productId, 1, replaceCart);
      if (r.ok) return setState("added");
      if (r.otherPharmacy && window.confirm(`Your cart has items from ${r.otherPharmacy}. Empty it and add this instead?`)) return add(true);
      if (!r.otherPharmacy) setState(r.error);
    });

  if (state === "added") {
    return (
      <span className="for-you-added">
        <i className="fa-solid fa-check" /> Added
      </span>
    );
  }
  return (
    <>
      <button type="button" className="btn btn-sm btn-outline" disabled={busy} onClick={() => add()}>
        <i className="fa-solid fa-cart-plus btn-icon" /> Add
      </button>
      {state !== "idle" && <small className="form-error">{state}</small>}
    </>
  );
}
