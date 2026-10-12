"use client";

import { useMemo, useState } from "react";
import { deleteHospital, saveHospital, setHospitalActive } from "@/app/actions/hospitals";
import Modal from "@/components/ui/Modal";
import useServerAction from "@/components/ui/useServerAction";

export type HospitalRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  staff: number;
  doctors: number;
  appointments: number;
};

export default function HospitalsView({ hospitals }: { hospitals: HospitalRow[] }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<HospitalRow | "new" | null>(null);
  const { busy, error, run } = useServerAction();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return hospitals;
    return hospitals.filter((h) => [h.name, h.city ?? "", h.address ?? ""].some((s) => s.toLowerCase().includes(q)));
  }, [hospitals, query]);

  return (
    <div className={busy ? "is-busy" : undefined}>
      <div className="appt-header">
        <div>
          <h2 className="section-heading">Hospitals</h2>
          <p className="section-sub">
            {hospitals.length} total · {hospitals.filter((h) => h.isActive).length} active
          </p>
        </div>
        <div className="appt-header-actions">
          <label className="search">
            <i className="fa-solid fa-magnifying-glass" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search hospitals..." />
          </label>
          <button className="btn btn-primary btn-lg" onClick={() => setEditing("new")}>
            <i className="fa-solid fa-plus btn-icon" /> Add Hospital
          </button>
        </div>
      </div>

      {error && <p className="form-error page-error">{error}</p>}

      {visible.length === 0 ? (
        <div className="empty-banner">No hospitals found.</div>
      ) : (
        <div className="doctor-grid">
          {visible.map((h) => (
            <article key={h.id} className={`card hospital-card${h.isActive ? "" : " inactive"}`}>
              <div className="hospital-top">
                <span className="stat-icon hospital-icon">
                  <i className="fa-solid fa-hospital" />
                </span>
                <span className={`status-pill ${h.isActive ? "status-confirmed" : "status-cancelled"}`}>
                  {h.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <h3 className="hospital-name">{h.name}</h3>
              <p className="doctor-meta">
                <i className="fa-solid fa-location-dot" /> {[h.address, h.city].filter(Boolean).join(", ") || "No address"}
              </p>
              <p className="doctor-meta">
                <i className="fa-solid fa-phone" /> {h.phone ?? "—"}
              </p>
              <p className="doctor-meta">
                <i className="fa-solid fa-envelope" /> {h.email ?? "—"}
              </p>
              <p className="doctor-meta">
                <i className="fa-solid fa-map-pin" />{" "}
                {h.latitude !== null && h.longitude !== null ? (
                  <a
                    className="table-link"
                    href={`https://www.openstreetmap.org/?mlat=${h.latitude}&mlon=${h.longitude}#map=17/${h.latitude}/${h.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    On the map
                  </a>
                ) : (
                  "No map position: patients won't be directed here"
                )}
              </p>

              <div className="doctor-stats three">
                <div>
                  <strong>{h.doctors}</strong>
                  <span>Doctors</span>
                </div>
                <div>
                  <strong>{h.staff}</strong>
                  <span>Staff</span>
                </div>
                <div>
                  <strong>{h.appointments}</strong>
                  <span>Appointments</span>
                </div>
              </div>

              <div className="doctor-actions">
                <button className="btn btn-outline btn-sm" onClick={() => setEditing(h)} disabled={busy}>
                  Edit
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={busy}
                  onClick={() =>
                    run(() => setHospitalActive(h.id, !h.isActive), {
                      confirm: h.isActive ? `Deactivate ${h.name}?` : undefined,
                    })
                  }
                >
                  {h.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  className="icon-btn danger"
                  disabled={busy}
                  aria-label={`Delete ${h.name}`}
                  title="Delete"
                  onClick={() => run(() => deleteHospital(h.id), { confirm: `Delete ${h.name}? This cannot be undone.` })}
                >
                  <i className="fa-solid fa-trash" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && <HospitalForm hospital={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function HospitalForm({ hospital, onClose }: { hospital: HospitalRow | null; onClose: () => void }) {
  const { busy, error, setError, submitWith } = useServerAction();
  const [lat, setLat] = useState(hospital?.latitude?.toString() ?? "");
  const [lng, setLng] = useState(hospital?.longitude?.toString() ?? "");
  const [locating, setLocating] = useState(false);

  // For an admin standing at the hospital: fill in where they are.
  const useCurrentLocation = () => {
    if (!("geolocation" in navigator)) return setError("This browser can't share its location.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(6));
        setLng(p.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setError("Couldn't get your location. Allow location access, or type the coordinates.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 }
    );
  };

  return (
    <Modal title={hospital ? `Edit ${hospital.name}` : "Add Hospital"} onClose={onClose}>
      <form onSubmit={submitWith(saveHospital, { onSuccess: onClose })} className="form-grid">
        <input type="hidden" name="id" value={hospital?.id ?? ""} />
        <label className="field full">
          <span>Name *</span>
          <input name="name" defaultValue={hospital?.name} required />
        </label>
        <label className="field">
          <span>Phone</span>
          <input type="tel" name="phone" defaultValue={hospital?.phone ?? ""} />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" name="email" defaultValue={hospital?.email ?? ""} />
        </label>
        <label className="field">
          <span>Address</span>
          <input name="address" defaultValue={hospital?.address ?? ""} />
        </label>
        <label className="field">
          <span>City</span>
          <input name="city" defaultValue={hospital?.city ?? ""} />
        </label>
        <label className="field">
          <span>Latitude</span>
          <input name="latitude" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="e.g. 8.484400" />
        </label>
        <label className="field">
          <span>Longitude</span>
          <input name="longitude" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="e.g. -13.234400" />
        </label>
        <p className="field-hint full">
          Lets Omega direct patients here. In Google Maps, right-click the hospital and click the numbers to copy them, or{" "}
          <button type="button" className="link-btn" onClick={useCurrentLocation} disabled={locating}>
            <i className="fa-solid fa-location-crosshairs" /> {locating ? "locating..." : "use my current location"}
          </button>
        </p>
        {error && <p className="form-error full">{error}</p>}
        <div className="modal-actions full">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving..." : hospital ? "Save Changes" : "Add Hospital"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
