import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureReminders } from "@/lib/notifications";
import { markAllNotificationsRead } from "@/app/actions/notifications";
import { NOTIFICATION_ICON, timeAgo } from "./shared";
import MarkReadLink from "./MarkReadLink";

/** Full notification history for a user (server component shared by both portals). */
export default async function NotificationsPage({ user }: { user: User }) {
  await ensureReminders(user);

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter((n) => !n.readAt).length;
  const now = Date.now();

  return (
    <div className="settings">
      <div className="appt-header">
        <div>
          <h2 className="section-heading">Notifications</h2>
          <p className="section-sub">{unread ? `${unread} unread` : "You're all caught up"}</p>
        </div>
        {unread > 0 && (
          <form action={markAllNotificationsRead}>
            <button className="btn btn-outline btn-sm">Mark all as read</button>
          </form>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="empty-banner">No notifications yet.</div>
      ) : (
        <div className="card notif-page-list">
          {notifications.map((n) => {
            const content = (
              <>
                <span className="notif-icon">
                  <i className={`fa-solid ${NOTIFICATION_ICON[n.type]}`} />
                </span>
                <span className="notif-text">
                  <strong>{n.title}</strong>
                  {n.body && <span>{n.body}</span>}
                  <small>{timeAgo(n.createdAt.toISOString(), now)}</small>
                </span>
              </>
            );
            const className = `notif-item${n.readAt ? "" : " unread"}`;
            return n.link ? (
              <MarkReadLink key={n.id} id={n.id} href={n.link} unread={!n.readAt} className={className}>
                {content}
              </MarkReadLink>
            ) : (
              <div key={n.id} className={className}>
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
