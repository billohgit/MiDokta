import Link from "next/link";
import type { Recommendations } from "@/lib/recommendations";
import AddToCartButton from "./AddToCartButton";

/**
 * Doctors and medicines suggested for the illness the patient told us about. General guidance only:
 * prescription-only medicines send the patient to a doctor, not the cart.
 */
export default function ForYouCard({ rec }: { rec: Recommendations }) {
  return (
    <section className="card for-you">
      <header className="for-you-head">
        <div>
          <h3 className="section-heading for-you-title">For your {rec.condition.toLowerCase()}</h3>
          <p className="section-sub">
            Based on the main health concern you told us. <Link href="/patient/settings#main-illness">Change it</Link>
          </p>
        </div>
      </header>
      <p className="for-you-disclaimer">
        <i className="fa-solid fa-circle-info" /> These are general suggestions, not a diagnosis. Talk to a doctor or pharmacist before taking any
        medicine, especially if you&apos;re pregnant, taking other medicines, or the medicine is for a child.
      </p>

      <div className="for-you-grid">
        <div>
          <h4 className="for-you-subhead">Doctors who can help</h4>
          {rec.doctors.length === 0 ? (
            <p className="form-note">
              No doctor matches yet. <Link href="/patient/appointments">Book any doctor</Link> and they&apos;ll advise you.
            </p>
          ) : (
            <ul className="for-you-list">
              {rec.doctors.map((d) => (
                <li key={d.id}>
                  <span>
                    <strong>{d.name}</strong>
                    <br />
                    <span className="section-sub">
                      {[
                        d.specialty,
                        d.treated > 0 && `treated ${d.treated} patient visit${d.treated === 1 ? "" : "s"} for this`,
                        d.rating && `★ ${d.rating}`,
                        d.fee ? `fee ${d.fee}` : "no booking fee",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <Link href={`/patient/appointments?book=${d.id}`} className="btn btn-sm btn-primary">
                    Book
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h4 className="for-you-subhead">Medicines often used</h4>
          {rec.medicines.length === 0 ? (
            <p className="form-note">
              {rec.known ? "This is treated by a doctor. Book a visit and they'll prescribe what you need." : "Book a doctor and they'll advise you on medicines."}
            </p>
          ) : (
            <ul className="for-you-list">
              {rec.medicines.map((m) => (
                <li key={m.name} className="for-you-medicine">
                  <span>
                    <strong>{m.name}</strong>
                    {m.note && <span className="section-sub"> · {m.note}</span>}{" "}
                    {m.otc ? (
                      <span className="status-pill status-confirmed">Over the counter</span>
                    ) : (
                      <span className="status-pill status-pending">Needs a doctor&apos;s prescription</span>
                    )}
                    {m.prescribedHere > 0 && <span className="section-sub"> · prescribed {m.prescribedHere}× by our doctors for this</span>}
                    {m.otc ? (
                      m.products.length === 0 ? (
                        <span className="section-sub for-you-stock">Not in stock in any pharmacy right now.</span>
                      ) : (
                        <span className="for-you-products">
                          {m.products.map((p) => (
                            <span key={p.id} className="for-you-product">
                              <span>
                                {p.name}
                                {p.detail && ` ${p.detail}`} · {p.price} · {p.pharmacyName}
                              </span>
                              <AddToCartButton productId={p.id} />
                            </span>
                          ))}
                        </span>
                      )
                    ) : (
                      <span className="section-sub for-you-stock">Book a doctor first: they&apos;ll decide if it&apos;s right for you.</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {rec.medicines.some((m) => m.otc && m.products.length > 0) && (
            <Link href="/patient/pharmacy/cart" className="link-btn">
              Go to cart <i className="fa-solid fa-chevron-right" />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
