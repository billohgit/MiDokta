"use client";

import { useRef, useState, useTransition } from "react";
import type { Gender, Role } from "@prisma/client";
import { updateProfile, uploadAvatar } from "@/app/actions/profile";

export type Profile = {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  phone: string | null;
  smsOptIn: boolean;
  dateOfBirth: string | null; // YYYY-MM-DD
  gender: Gender | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zipCode: string | null;
};

const GENDER_LABEL: Record<Gender, string> = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };

const titleCase = (s: string) => s[0] + s.slice(1).toLowerCase();

const formatDob = (iso: string | null) => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
};

function initials(p: Profile) {
  const words = `${p.firstName} ${p.lastName}`.trim().split(/\s+/);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

type FieldProps = {
  label: string;
  name: keyof Profile;
  editing: boolean;
  display: string | null;
  children?: React.ReactNode; // custom input
  type?: string;
  defaultValue?: string | null;
  required?: boolean;
};

function Field({ label, name, editing, display, children, type = "text", defaultValue, required }: FieldProps) {
  return (
    <div className="detail-row">
      <label className="detail-label" htmlFor={`f-${name}`}>
        {label}
      </label>
      {editing ? (
        (children ?? (
          <input
            id={`f-${name}`}
            name={name}
            type={type}
            defaultValue={defaultValue ?? ""}
            required={required}
            className="detail-input"
          />
        ))
      ) : (
        <span className="detail-value">{display || "—"}</span>
      )}
    </div>
  );
}

export default function ProfileSettings({ profile }: { profile: Profile }) {
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [uploading, startUploading] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // onSubmit rather than <form action> so a failed save doesn't reset what was typed.
  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startSaving(async () => {
      const result = await updateProfile(formData);
      if (result.ok) {
        setEditing(false);
        setMessage({ type: "success", text: "Profile updated." });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  };

  const onPhotoChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const data = new FormData();
    data.append("avatar", file);
    startUploading(async () => {
      const result = await uploadAvatar(data);
      setMessage(result.ok ? { type: "success", text: "Photo updated." } : { type: "error", text: result.error });
      if (fileRef.current) fileRef.current.value = "";
    });
  };

  const cancel = () => {
    formRef.current?.reset();
    setEditing(false);
    setMessage(null);
  };

  const fullName = `${profile.firstName} ${profile.lastName}`;

  return (
    <div className="settings">
      <section className="card profile-card">
        <div className="profile-avatar">
          <div className="profile-ring">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt={fullName} />
            ) : (
              <span>{initials(profile)}</span>
            )}
          </div>
          <button
            type="button"
            className="camera-btn"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Change profile photo"
          >
            <i className={`fa-solid ${uploading ? "fa-spinner fa-spin" : "fa-camera"}`} />
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPhotoChosen} />
        </div>
        <div>
          <h2 className="profile-name">{fullName}</h2>
          <p className="profile-role">{titleCase(profile.role)}</p>
        </div>
      </section>

      {message && <p className={`settings-message ${message.type}`}>{message.text}</p>}

      <form ref={formRef} onSubmit={save}>
        <section className="card details-card">
          <div className="details-head">
            <h3>Basic Detail</h3>
            {editing ? (
              <button type="button" className="icon-btn" onClick={cancel} aria-label="Cancel editing">
                <i className="fa-solid fa-xmark" />
              </button>
            ) : (
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setEditing(true);
                  setMessage(null);
                }}
                aria-label="Edit details"
              >
                <i className="fa-solid fa-pen" />
              </button>
            )}
          </div>

          <div className="details-grid">
            {editing ? (
              <>
                <Field label="First Name:" name="firstName" editing display={null} defaultValue={profile.firstName} required />
                <Field label="Last Name:" name="lastName" editing display={null} defaultValue={profile.lastName} required />
              </>
            ) : (
              <Field label="Name:" name="firstName" editing={false} display={fullName} />
            )}
            <Field label="Email" name="email" type="email" editing={editing} display={profile.email} defaultValue={profile.email} required />
            <Field label="Phone Number:" name="phone" type="tel" editing={editing} display={profile.phone} defaultValue={profile.phone} />
            <Field label="SMS Notifications:" name="smsOptIn" editing={editing} display={profile.smsOptIn ? "On" : "Off"}>
              <label className="checkbox-line detail-input-plain">
                <input id="f-smsOptIn" type="checkbox" name="smsOptIn" defaultChecked={profile.smsOptIn} /> Receive text messages
              </label>
            </Field>
            <Field
              label="Date of Birth:"
              name="dateOfBirth"
              type="date"
              editing={editing}
              display={formatDob(profile.dateOfBirth)}
              defaultValue={profile.dateOfBirth}
            />
            <Field label="Gender:" name="gender" editing={editing} display={profile.gender && GENDER_LABEL[profile.gender]}>
              <select id="f-gender" name="gender" defaultValue={profile.gender ?? ""} className="detail-input">
                <option value="">Prefer not to say</option>
                {Object.entries(GENDER_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <h3 className="details-subhead">Address</h3>
          <div className="details-grid">
            <div className="full-row">
              <Field label="Address:" name="address" editing={editing} display={profile.address} defaultValue={profile.address} />
            </div>
            <Field label="City:" name="city" editing={editing} display={profile.city} defaultValue={profile.city} />
            <Field label="State:" name="state" editing={editing} display={profile.state} defaultValue={profile.state} />
            <Field label="Country:" name="country" editing={editing} display={profile.country} defaultValue={profile.country} />
            <Field label="Zip Code:" name="zipCode" editing={editing} display={profile.zipCode} defaultValue={profile.zipCode} />
          </div>
        </section>

        <div className="settings-actions">
          <button type="submit" className="btn btn-primary btn-save" disabled={!editing || saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
