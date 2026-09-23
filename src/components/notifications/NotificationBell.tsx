"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/notifications";
import { NOTIFICATION_ICON, type NotificationItem, timeAgo } from "./shared";

const POLL_MS = 60_000;

export default function NotificationBell({ viewAllHref }: { viewAllHref: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data: { items: NotificationItem[]; unread: number } = await res.json();
      setItems(data.items);
      setUnread(data.unread);
      setLoaded(true);
    } catch {
      // Network hiccup — keep showing the last known state.
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openItem = async (n: NotificationItem) => {
    setOpen(false);
    if (!n.readAt) {
      setItems((list) => list.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)));
      setUnread((u) => Math.max(0, u - 1));
      await markNotificationRead(n.id);
    }
    if (n.link) router.push(n.link);
  };

  const readAll = async () => {
    setItems((list) => list.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })));
    setUnread(0);
    await markAllNotificationsRead();
  };

  return (
    <div className="notif" ref={ref}>
      <button
        className="icon-btn"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
      >
        <i className="fa-regular fa-bell" />
        {unread > 0 && <span className="badge">{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel card" role="menu">
          <div className="notif-head">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button className="link-btn" onClick={readAll}>
                Mark all as read
              </button>
            )}
          </div>

          <div className="notif-list">
            {!loaded ? (
              <p className="notif-empty">Loading...</p>
            ) : items.length === 0 ? (
              <p className="notif-empty">You&apos;re all caught up.</p>
            ) : (
              items.map((n) => (
                <button key={n.id} className={`notif-item${n.readAt ? "" : " unread"}`} onClick={() => openItem(n)} role="menuitem">
                  <span className="notif-icon">
                    <i className={`fa-solid ${NOTIFICATION_ICON[n.type]}`} />
                  </span>
                  <span className="notif-text">
                    <strong>{n.title}</strong>
                    {n.body && <span>{n.body}</span>}
                    <small>{timeAgo(n.createdAt)}</small>
                  </span>
                </button>
              ))
            )}
          </div>

          <Link href={viewAllHref} className="notif-footer" onClick={() => setOpen(false)}>
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
