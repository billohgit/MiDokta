"use client";

import { useMemo, useState } from "react";
import type { Gender } from "@prisma/client";
import { deleteStaff, saveStaff, setStaffActive } from "@/app/actions/staff";
import Avatar from "@/components/appointments/Avatar";
import Modal from "@/components/ui/Modal";
import useServerAction from "@/components/ui/useServerAction";

type StaffRole = "ADMIN" | "NURSE" | "PHARMACIST" | "RECEPTIONIST";

export type StaffRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  smsOptIn: boolean;
  avatarUrl: string | null;
  gender: Gender | null;
  role: StaffRole;
  isActive: boolean;
  hospital: { id: string; name: string } | null;
};

type Hospital = { id: string; name: string };

const ROLE_LABEL: Record<StaffRole, string> = {
  ADMIN: "Admin",
  NURSE: "Nurse",
  PHARMACIST: "Pharmacist",
  RECEPTIONIST: "Receptionist",
};
const ROLES = Object.keys(ROLE_LABEL) as StaffRole[];

type Props = { staff: StaffRow[]; hospitals: Hospital[]; currentUserId: string };

export default function StaffView({ staff, hospitals, currentUserId }: Props) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<StaffRole | "ALL">("ALL");
  const [editing, setEditing] = useState<StaffRow | "new" | null>(null);
  const { busy, error, run } = useServerAction();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff.filter(
      (s) =>
        (roleFilter === "ALL" || s.role === roleFilter) &&
        (!q || [s.firstName, s.lastName, s.email, s.phone ?? ""].some((v) => v.toLowerCase().includes(q))),
    );
  }, [staff, query, roleFilter]);

  const count = (role: StaffRole) => staff.filter((s) => s.role === role).length;

  return (
    <div className={busy ? "is-busy" : undefined}>
      <div className="appt-header">
        <div>
          <h2 className="section-heading">Staff</h2>
          <p className="section-sub">Admins, nurses, pharmacists and receptionists</p>
        </div>
        <div className="appt-header-actions">
          <label className="search">
            <i className="fa-solid fa-magnifying-glass" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search staff..." />
          </label>
          <button className="btn btn-primary btn-lg" onClick={() => setEditing("new")}>
            <i className="fa-solid fa-plus btn-icon" /> Add Staff
          </button>
        </div>
      </div>

      <div className="all-header">
        <div className="segmented" role="tablist">
          <button
            role="tab"
            aria-selected={roleFilter === "ALL"}
            className={roleFilter === "ALL" ? "on" : ""}
            onClick={() => setRoleFilter("ALL")}
          >
            All ({staff.length})
          </button>
          {ROLES.map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={roleFilter === r}
              className={roleFilter === r ? "on" : ""}
              onClick={() => setRoleFilter(r)}
            >
              {ROLE_LABEL[r]}s ({count(r)})
            </button>
          ))}
        </div>
      </div>

      {error && <p className="form-error page-error">{error}</p>}

      {visible.length === 0 ? (
        <div className="empty-banner">No staff found.</div>
      ) : (
        <div className="card table-wrap">
          <table className="appt-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Hospital</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const isMe = s.id === currentUserId;
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="person-cell">
                        <Avatar person={s} size={36} />
                        <span>
                          {s.firstName} {s.lastName}
                          {isMe && <em className="you-tag"> (you)</em>}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="role-pill">{ROLE_LABEL[s.role]}</span>
                    </td>
                    <td>{s.email}</td>
                    <td>{s.phone ?? "—"}</td>
                    <td>{s.hospital?.name ?? "—"}</td>
                    <td>
                      <span className={`status-pill ${s.isActive ? "status-confirmed" : "status-cancelled"}`}>
                        {s.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="row-actions">
                      <button className="btn btn-sm btn-outline" onClick={() => setEditing(s)} disabled={busy}>
                        Edit
                      </button>
                      {!isMe && (
                        <>
                          <button
                            className="btn btn-sm btn-outline"
                            disabled={busy}
                            onClick={() =>
                              run(() => setStaffActive(s.id, !s.isActive), {
                                confirm: s.isActive
                                  ? `Deactivate ${s.firstName} ${s.lastName}? They will no longer be able to sign in.`
                                  : undefined,
                              })
                            }
                          >
                            {s.isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            className="icon-btn danger"
                            disabled={busy}
                            aria-label={`Delete ${s.firstName} ${s.lastName}`}
                            title="Delete"
                            onClick={() =>
                              run(() => deleteStaff(s.id), {
                                confirm: `Delete ${s.firstName} ${s.lastName}? This cannot be undone.`,
                              })
                            }
                          >
                            <i className="fa-solid fa-trash" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <StaffForm member={editing === "new" ? null : editing} hospitals={hospitals} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function StaffForm({
  member,
  hospitals,
  onClose,
}: {
  member: StaffRow | null;
  hospitals: Hospital[];
  onClose: () => void;
}) {
  const { busy, error, submitWith } = useServerAction();

  return (
    <Modal title={member ? `Edit ${member.firstName} ${member.lastName}` : "Add Staff Member"} onClose={onClose} wide>
      <form onSubmit={submitWith(saveStaff, { onSuccess: onClose })} className="form-grid">
        <input type="hidden" name="id" value={member?.id ?? ""} />
        <label className="field">
          <span>First Name *</span>
          <input name="firstName" defaultValue={member?.firstName} required />
        </label>
        <label className="field">
          <span>Last Name *</span>
          <input name="lastName" defaultValue={member?.lastName} required />
        </label>
        <label className="field">
          <span>Email *</span>
          <input type="email" name="email" defaultValue={member?.email} required autoComplete="off" />
        </label>
        <label className="field">
          <span>Phone</span>
          <input type="tel" name="phone" defaultValue={member?.phone ?? ""} placeholder="+232 76 123 456" />
        </label>
        <label className="field sms-opt">
          <span>SMS notifications</span>
          <span className="checkbox-line">
            <input type="checkbox" name="smsOptIn" defaultChecked={member?.smsOptIn ?? true} /> Send text messages to
            this phone
          </span>
        </label>
        <span className="full-hide" />
        <label className="field">
          <span>Role *</span>
          <select name="role" defaultValue={member?.role ?? "NURSE"} required>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Hospital</span>
          <select name="hospitalId" defaultValue={member?.hospital?.id ?? ""}>
            <option value="">Not assigned</option>
            {hospitals.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Gender</span>
          <select name="gender" defaultValue={member?.gender ?? ""}>
            <option value="">Prefer not to say</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="field">
          <span>{member ? "New Password" : "Password *"}</span>
          <input
            type="password"
            name="password"
            minLength={8}
            required={!member}
            autoComplete="new-password"
            placeholder={member ? "Leave blank to keep current" : "At least 8 characters"}
          />
        </label>
        {error && <p className="form-error full">{error}</p>}
        <div className="modal-actions full">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving..." : member ? "Save Changes" : "Add Staff"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
