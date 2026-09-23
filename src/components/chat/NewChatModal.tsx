"use client";

import { useMemo, useState, useTransition } from "react";
import { createGroupConversation, startDirectConversation } from "@/app/actions/chat";
import Avatar from "@/components/appointments/Avatar";
import Modal from "@/components/ui/Modal";
import { type ChatUser, ROLE_LABEL, displayName } from "./types";

type Props = { contacts: ChatUser[]; onClose: () => void; onOpened: (conversationId: string) => void };

export default function NewChatModal({ contacts, onClose, onOpened }: Props) {
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const [roleFilter, setRoleFilter] = useState<"ALL" | "STAFF" | "PATIENT">("ALL");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter(
      (c) =>
        (roleFilter === "ALL" || (roleFilter === "PATIENT") === (c.role === "PATIENT")) &&
        (!q || displayName(c).toLowerCase().includes(q))
    );
  }, [contacts, query, roleFilter]);

  /** People who can't use the app and have no way to receive SMS can't be messaged. */
  const unreachable = (c: ChatUser) => !c.canSignIn && !c.smsReachable;

  const note = (c: ChatUser) =>
    c.canSignIn ? ROLE_LABEL[c.role] : `${ROLE_LABEL[c.role]} · ${c.smsReachable ? "by SMS" : "no phone for SMS"}`;

  const startDirect = (userId: string) =>
    startTransition(async () => {
      const result = await startDirectConversation(userId);
      if (result.ok) onOpened(result.id);
      else setError(result.error);
    });

  const createGroup = () =>
    startTransition(async () => {
      const result = await createGroupConversation(title, [...selected]);
      if (result.ok) onOpened(result.id);
      else setError(result.error);
    });

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Modal title="New Conversation" onClose={onClose}>
      <div className="segmented chat-mode" role="tablist">
        <button role="tab" aria-selected={mode === "direct"} className={mode === "direct" ? "on" : ""} onClick={() => setMode("direct")}>
          <i className="fa-solid fa-user btn-icon" /> Direct message
        </button>
        <button role="tab" aria-selected={mode === "group"} className={mode === "group" ? "on" : ""} onClick={() => setMode("group")}>
          <i className="fa-solid fa-users btn-icon" /> Group
        </button>
      </div>

      {mode === "group" && (
        <label className="field chat-group-name">
          <span>Group name *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Cardiology team" />
        </label>
      )}

      <label className="search chat-search">
        <i className="fa-solid fa-magnifying-glass" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people..." autoFocus />
      </label>
      <div className="contact-filter">
        {(["ALL", "STAFF", "PATIENT"] as const).map((r) => (
          <button key={r} type="button" className={roleFilter === r ? "on" : ""} onClick={() => setRoleFilter(r)}>
            {r === "ALL" ? "Everyone" : r === "STAFF" ? "Medical staff" : "Patients"}
          </button>
        ))}
      </div>

      <div className="contact-list">
        {filtered.length === 0 ? (
          <p className="chat-empty-list">No one found.</p>
        ) : (
          filtered.map((c) =>
            mode === "direct" ? (
              <button key={c.id} className="contact-row" onClick={() => startDirect(c.id)} disabled={busy || unreachable(c)}>
                <Avatar person={c} size={38} />
                <span className="contact-name">
                  <strong>{displayName(c)}</strong>
                  <small className={unreachable(c) ? "warn-text" : undefined}>{note(c)}</small>
                </span>
                {!c.canSignIn && c.smsReachable && <i className="fa-solid fa-comment-sms sms-only-icon" />}
                <i className="fa-solid fa-chevron-right contact-go" />
              </button>
            ) : (
              <label key={c.id} className={`contact-row${unreachable(c) ? " disabled" : ""}`}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} disabled={unreachable(c)} />
                <Avatar person={c} size={38} />
                <span className="contact-name">
                  <strong>{displayName(c)}</strong>
                  <small className={unreachable(c) ? "warn-text" : undefined}>{note(c)}</small>
                </span>
                {!c.canSignIn && c.smsReachable && <i className="fa-solid fa-comment-sms sms-only-icon" />}
              </label>
            )
          )
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {mode === "group" && (
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={createGroup} disabled={busy || !title.trim() || selected.size === 0}>
            {busy ? "Creating..." : `Create group${selected.size ? ` (${selected.size + 1})` : ""}`}
          </button>
        </div>
      )}
    </Modal>
  );
}
