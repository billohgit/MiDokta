"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { addToCart } from "@/app/actions/pharmacy";
import useServerAction from "@/components/ui/useServerAction";
import { distanceKm, formatDistance } from "@/lib/geo";
import type { ShopProduct } from "./shared";
import { usePatientLocation } from "./usePatientLocation";

type Props = { products: ShopProduct[]; cartCount: number; cartPharmacy: string | null };

/** The pharmacy shop: search every pharmacy's products and add them to the cart. */
export default function ShopView({ products, cartCount, cartPharmacy }: Props) {
  const [query, setQuery] = useState("");
  const [pharmacyId, setPharmacyId] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const { busy, error, setError, run } = useServerAction();
  const { location, status: locating, request: findMe } = usePatientLocation();
  const [nearestFirst, setNearestFirst] = useState(true);

  // How far each pharmacy is, once the patient shares where they are; null where a pharmacy has no position.
  const away = useMemo(() => {
    const km = new Map<string, number | null>();
    for (const p of products) {
      if (!km.has(p.pharmacyId)) km.set(p.pharmacyId, location && p.pharmacyPosition ? distanceKm(location, p.pharmacyPosition) : null);
    }
    return km;
  }, [products, location]);

  const pharmacies = useMemo(() => [...new Map(products.map((p) => [p.pharmacyId, p.pharmacyName])).entries()], [products]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = products.filter(
      (p) => (!pharmacyId || p.pharmacyId === pharmacyId) && (!q || `${p.name} ${p.detail} ${p.pharmacyName}`.toLowerCase().includes(q)),
    );
    // Nearest pharmacies first; ones without a known position go last.
    if (location && nearestFirst) list.sort((a, b) => (away.get(a.pharmacyId) ?? Infinity) - (away.get(b.pharmacyId) ?? Infinity));
    return list;
  }, [products, query, pharmacyId, location, nearestFirst, away]);

  const add = (p: ShopProduct, replaceCart = false) => {
    setAdding(p.id);
    setAdded(null);
    run(() => addToCart(p.id, 1, replaceCart), {
      onSuccess: () => setAdded(p.id),
    });
  };

  // A cart holds one pharmacy's products: offer to start a new cart instead.
  const onError = error?.startsWith("Your cart has items from") ? error : null;
  const conflict = onError && adding ? products.find((p) => p.id === adding) : null;

  return (
    <div className={busy ? "is-busy" : undefined}>
      <div className="appt-header">
        <div>
          <h2 className="section-heading">Pharmacy</h2>
          <p className="section-sub">Order medicines from local pharmacies, delivered or ready to collect.</p>
        </div>
        <div className="appt-header-actions">
          <Link href="/patient/pharmacy/scan" className="btn btn-outline btn-lg">
            <i className="fa-solid fa-file-prescription btn-icon" /> Scan prescription
          </Link>
          <Link href="/patient/pharmacy/orders" className="btn btn-outline btn-lg">
            <i className="fa-solid fa-receipt btn-icon" /> My Orders
          </Link>
          <Link href="/patient/pharmacy/cart" className="btn btn-primary btn-lg">
            <i className="fa-solid fa-cart-shopping btn-icon" /> Cart{cartCount > 0 && ` (${cartCount})`}
          </Link>
        </div>
      </div>

      <div className="all-header shop-filters">
        <label className="search">
          <i className="fa-solid fa-magnifying-glass" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search medicines..." />
        </label>
        {pharmacies.length > 1 && (
          <select className="shop-select" value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)} aria-label="Pharmacy">
            <option value="">All pharmacies</option>
            {pharmacies.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
                {away.get(id) != null ? ` (${formatDistance(away.get(id)!)})` : ""}
              </option>
            ))}
          </select>
        )}
        {location ? (
          <label className="checkbox-line compact">
            <input type="checkbox" checked={nearestFirst} onChange={(e) => setNearestFirst(e.target.checked)} /> Nearest first
          </label>
        ) : (
          <button type="button" className="btn btn-outline" onClick={findMe} disabled={locating === "locating"}>
            <i className={`fa-solid ${locating === "locating" ? "fa-spinner fa-spin" : "fa-location-crosshairs"} btn-icon`} />
            {locating === "locating" ? "Finding you..." : "Show distances"}
          </button>
        )}
      </div>
      {locating === "denied" && (
        <p className="form-note">Location is blocked for this site. Allow it in your browser settings to see how far each pharmacy is.</p>
      )}

      {conflict ? (
        <div className="stock-alert">
          <i className="fa-solid fa-cart-shopping" /> {onError} You can order from one pharmacy at a time.{" "}
          <button className="link-btn" onClick={() => add(conflict, true)}>
            Empty the cart and add {conflict.name}
          </button>{" "}
          ·{" "}
          <button className="link-btn" onClick={() => setError(null)}>
            Keep my cart
          </button>
        </div>
      ) : (
        error && <p className="form-error page-error">{error}</p>
      )}
      {cartPharmacy && !conflict && <p className="form-note">Your cart is from {cartPharmacy}.</p>}

      {visible.length === 0 ? (
        <div className="empty-banner">{products.length === 0 ? "No pharmacies are selling online yet." : "Nothing matches your search."}</div>
      ) : (
        <div className="shop-grid">
          {visible.map((p) => (
            <article key={p.id} className="card product-card">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt={`${p.name} ${p.detail}`} className="product-image" loading="lazy" />
              ) : (
                <div className="product-image product-image-empty">
                  <i className="fa-solid fa-capsules" />
                </div>
              )}
              <h3>{p.name}</h3>
              {p.detail && <p className="section-sub">{p.detail}</p>}
              {p.description && <p className="product-desc">{p.description}</p>}
              <p className="product-pharmacy">
                <i className="fa-solid fa-store" /> {p.pharmacyName}
                {p.pharmacyCity && ` · ${p.pharmacyCity}`}
                {away.get(p.pharmacyId) != null && (
                  <span className="product-distance">
                    {" "}
                    · <i className="fa-solid fa-location-dot" /> {formatDistance(away.get(p.pharmacyId)!)}
                  </span>
                )}
              </p>
              <div className="product-foot">
                <strong className="product-price">{p.price}</strong>
                <span className={`status-pill ${p.inStock > 5 ? "status-confirmed" : "status-pending"}`}>
                  {p.inStock > 5 ? "In stock" : `${p.inStock} left`}
                </span>
              </div>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => add(p)}>
                {busy && adding === p.id ? (
                  <i className="fa-solid fa-spinner fa-spin" />
                ) : added === p.id ? (
                  <>
                    <i className="fa-solid fa-check btn-icon" /> Added
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-cart-plus btn-icon" /> Add to cart
                  </>
                )}
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
