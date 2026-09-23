"use client";

import { useState, useTransition } from "react";
import { addGroupMembers, leaveGroup } from "@/app/actions/chat";
import Avatar from "@/components/appointments/Avatar";
import { type ChatUser, type ConversationSummary, ROLE_LABEL, displayName } from "./types";

type Props = {
  conversation: ConversationSummary;
  me: ChatUser;
  contacts: ChatUser[];
  onClose: () => void;
  onChanged: () => void;
  onLeft: () => void;
};

export default function GroupInfoPanel({ conversation, me, contacts, onClose, onChanged, onLeft }: Props) {
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const memberIds = new Set(conversation.participants.map((p) => p.id));
  const candidates = contacts.filter((c) => !memberIds.has(c.id) && (c.canSignIn || c.smsReachable));

  const add = () =>
    startTransition(async () => {
      const result = await addGroupMembers(conversation.id, [...adding]);
      if (result.ok) {
        setAdding(new Set());
        setError(null);
        onChanged();
      } else {
        setError(result.error);
      }
    });

  const leave = () => {
    if (!confirm(`Leave "${conversation.title}"? You'll stop receiving its messages.`)) return;
    startTransition(async () => {
      const result = await leaveGroup(conversation.id);
      if (result.ok) onLeft();
      else setError(result.error);
    });
  };

  return (
    <aside className="group-info">
      <div className="group-info-head">
        <strong>Group info</strong>
        <button className="icon-btn" onClick={onClose} aria-label="Close group info">
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      <div className="group-info-body">
        <span className="group-avatar large">
          <i className="fa-solid fa-users" />
        </span>
        <h3>{conversation.title}</h3>
        <p className="section-sub">{conversation.participants.length} members</p>

        <p className="form-section">Members</p>
        <ul className="member-list">
          {conversation.participants.map((p) => (
            <li key={p.id}>
              <Avatar person={p} size={32} />
              <span>
                {p.id === me.id ? "You" : displayName(p)}
                <small>
                  {ROLE_LABEL[p.role]}
                  {!p.canSignIn && (p.smsReachable ? " · by SMS" : " · no phone for SMS")}
                </small>
              </span>
            </li>
          ))}
        </ul>

        {candidates.length > 0 && (
          <>
            <p className="form-section">Add people</p>
            <div className="member-list add">
              {candidates.map((c) => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    checked={adding.has(c.id)}
                    onChange={() =>
                      setAdding((s) => {
                        const next = new Set(s);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        return next;
                      })
                    }
                  />
                  <Avatar person={c} size={28} />
                  <span>{displayName(c)}</span>
                </label>
              ))}
            </div>
            <button className="btn btn-primary btn-sm" onClick={add} disabled={busy || adding.size === 0}>
              Add {adding.size || ""} {adding.size === 1 ? "person" : "people"}
            </button>
          </>
        )}

        {error && <p className="form-error">{error}</p>}

        <button className="btn btn-outline btn-sm danger-text leave-btn" onClick={leave} disabled={busy}>
          <i className="fa-solid fa-right-from-bracket btn-icon" /> Leave group
        </button>
      </div>
    </aside>
  );
}
