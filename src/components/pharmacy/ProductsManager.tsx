"use client";

import { useState } from "react";
import { saveProduct, setProductActive } from "@/app/actions/pharmacy";
import Modal from "@/components/ui/Modal";
import useServerAction from "@/components/ui/useServerAction";
import { formatMoney } from "@/lib/money";

export type ProductRow = {
  id: string;
  name: string;
  strength: string | null;
  form: string | null;
  description: string | null;
  price: string;
  quantity: number;
  isActive: boolean;
  sold30d: number;
};

/** A pharmacy's own products: what it sells, at what price, and how many are in stock. */
export default function ProductsManager({ products }: { products: ProductRow[] }) {
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const { busy, error, run } = useServerAction();
  const form = useServerAction();
  const product = editing === "new" ? null : editing;

  return (
    <div className={busy ? "is-busy" : undefined}>
      <div className="all-header">
        <p className="section-sub">
          {products.filter((p) => p.isActive).length} on sale · {products.filter((p) => p.isActive && p.quantity === 0).length} sold out
        </p>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          <i className="fa-solid fa-plus btn-icon" /> Add Product
        </button>
      </div>
      {error && <p className="form-error page-error">{error}</p>}

      {products.length === 0 ? (
        <div className="empty-banner">No products yet. Add what you sell, with its price and stock.</div>
      ) : (
        <div className="card table-wrap">
          <table className="appt-table">
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Price</th>
                <th className="num">In stock</th>
                <th className="num">Sold (30d)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    {p.strength && ` ${p.strength}`}
                    <br />
                    <span className="section-sub">{p.form ?? "—"}</span>
                    {!p.isActive && (
                      <>
                        {" "}
                        <span className="status-pill status-void">Hidden</span>
                      </>
                    )}
                  </td>
                  <td className="num">{formatMoney(p.price)}</td>
                  <td className="num">
                    {p.quantity === 0 ? <span className="status-pill status-cancelled">Sold out</span> : p.quantity}
                  </td>
                  <td className="num">{p.sold30d}</td>
                  <td className="row-actions">
                    <button className="btn btn-sm btn-outline" disabled={busy} onClick={() => setEditing(p)}>
                      Edit
                    </button>
                    <button
                      className="btn btn-sm btn-outline"
                      disabled={busy}
                      onClick={() => run(() => setProductActive(p.id, !p.isActive), { confirm: p.isActive ? `Stop selling ${p.name}?` : undefined })}
                    >
                      {p.isActive ? "Hide" : "Show"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={product ? `Edit ${product.name}` : "Add a product"} onClose={() => setEditing(null)}>
          <form className="form-grid" onSubmit={form.submitWith(saveProduct, { onSuccess: () => setEditing(null) })}>
            {product && <input type="hidden" name="id" value={product.id} />}
            <label className="field full">
              <span>Name *</span>
              <input name="name" maxLength={120} defaultValue={product?.name ?? ""} required placeholder="e.g. Paracetamol" />
            </label>
            <label className="field">
              <span>Strength</span>
              <input name="strength" maxLength={40} defaultValue={product?.strength ?? ""} placeholder="e.g. 500mg" />
            </label>
            <label className="field">
              <span>Form</span>
              <input name="form" maxLength={40} defaultValue={product?.form ?? ""} placeholder="e.g. Tablets, pack of 20" />
            </label>
            <label className="field">
              <span>Price (Le) *</span>
              <input name="price" inputMode="decimal" defaultValue={product?.price ?? ""} required />
            </label>
            <label className="field">
              <span>In stock *</span>
              <input name="quantity" type="number" min={0} step={1} defaultValue={product?.quantity ?? ""} required />
            </label>
            <label className="field full">
              <span>Description</span>
              <textarea name="description" rows={2} maxLength={500} defaultValue={product?.description ?? ""} placeholder="What it's for, pack size..." />
            </label>
            {form.error && <p className="form-error full">{form.error}</p>}
            <div className="modal-actions full">
              <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={form.busy}>
                {form.busy ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
