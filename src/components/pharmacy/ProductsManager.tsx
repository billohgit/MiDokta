"use client";

import { useEffect, useRef, useState } from "react";
import { saveProduct, setProductActive } from "@/app/actions/pharmacy";
import Modal from "@/components/ui/Modal";
import { shrinkUpload } from "@/components/ui/ImageCapture";
import useServerAction from "@/components/ui/useServerAction";
import { formatMoney } from "@/lib/money";

export type ProductRow = {
  id: string;
  name: string;
  strength: string | null;
  form: string | null;
  description: string | null;
  imageUrl: string | null;
  price: string;
  quantity: number;
  isActive: boolean;
  sold30d: number;
};

/** A pharmacy's own products: what it sells, at what price, and how many are in stock. */
export default function ProductsManager({ products }: { products: ProductRow[] }) {
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const { busy, error, run } = useServerAction();
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
                  <td className="product-cell">
                    <ProductThumb url={p.imageUrl} />
                    <span>
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
                    </span>
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
          <ProductForm product={product} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}

/** Photos are shown at most a few hundred pixels wide. */
const PHOTO_SIDE = 900;

function ProductThumb({ url }: { url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="product-thumb" />
  ) : (
    <span className="product-thumb product-thumb-empty">
      <i className="fa-solid fa-capsules" />
    </span>
  );
}

/** Add or edit a product, with an optional photo (shrunk in the browser before upload). */
function ProductForm({ product, onDone }: { product: ProductRow | null; onDone: () => void }) {
  const { busy, error, setError, run } = useServerAction();
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(product?.imageUrl ?? null);
  const [removed, setRemoved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPhoto(await shrinkUpload(file, "product.jpg", PHOTO_SIDE));
      setRemoved(false);
      setError(null);
    } catch {
      setError("That file couldn't be read as an image. Try a JPEG or PNG.");
    }
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.delete("image");
    if (photo) formData.set("image", photo);
    if (removed) formData.set("removeImage", "on");
    run(() => saveProduct(formData), { onSuccess: onDone });
  };

  return (
    <form className="form-grid" onSubmit={submit}>
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="field full product-photo-field">
        <span>Photo</span>
        <div className="product-photo">
          {preview && !removed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Product" />
          ) : (
            <span className="product-thumb-empty">
              <i className="fa-solid fa-camera" />
            </span>
          )}
          <div className="product-photo-actions">
            <button type="button" className="btn btn-sm btn-outline" onClick={() => fileRef.current?.click()}>
              {preview && !removed ? "Change photo" : "Add photo"}
            </button>
            {preview && !removed && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => {
                  setPhoto(null);
                  setPreview(null);
                  setRemoved(true);
                }}
              >
                Remove
              </button>
            )}
            <span className="form-note">A clear photo of the pack helps patients pick the right medicine.</span>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => choose(e.target.files?.[0])} />
        </div>
      </div>
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
      {error && <p className="form-error full">{error}</p>}
      <div className="modal-actions full">
        <button type="button" className="btn btn-outline" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
