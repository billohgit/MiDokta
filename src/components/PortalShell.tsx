"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar, { type NavItem } from "./Sidebar";
import Topbar, { type TopbarUser } from "./Topbar";
import IncomingCallWatcher from "./calls/IncomingCallWatcher";

/** `basePath` is the portal root, e.g. "/admin". `badges` adds counts to other nav items, keyed by href. */
type Props = {
  nav: NavItem[];
  basePath: string;
  user: TopbarUser;
  initialChatUnread: number;
  badges?: Record<string, number>;
  /** Doctors and patients can be rung: watch for incoming video calls on every page. */
  calls?: boolean;
  children: React.ReactNode;
};

const CHAT_UNREAD_POLL_MS = 15_000;

export default function PortalShell({ nav, basePath, user, initialChatUnread, badges, calls, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const [chatUnread, setChatUnread] = useState(initialChatUnread);

  // Layouts don't re-render on client navigation, so keep the chat badge fresh by polling.
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/chat/unread", { cache: "no-store" });
        if (res.ok) setChatUnread((await res.json()).unread);
      } catch {
        // Ignore; try again next tick.
      }
    };
    load();
    const timer = setInterval(load, CHAT_UNREAD_POLL_MS);
    return () => clearInterval(timer);
  }, [pathname]);

  const section = pathname.slice(basePath.length).split("/")[1] ?? "";
  const title =
    nav.find((item) => pathname.startsWith(item.href))?.label ??
    (section ? section[0].toUpperCase() + section.slice(1) : "Dashboard");

  const toggle = () => {
    if (window.matchMedia("(max-width: 992px)").matches) setMobileOpen((o) => !o);
    else setCollapsed((c) => !c);
  };

  return (
    <div className={`layout${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}>
      <Sidebar
        nav={nav}
        badges={{ ...badges, [`${basePath}/chat`]: chatUnread }}
        pathname={pathname}
        onNavigate={() => setMobileOpen(false)}
      />
      <div className="backdrop" onClick={() => setMobileOpen(false)} />
      <main className="main">
        <Topbar title={title} user={user} basePath={basePath} onToggle={toggle} />
        {children}
      </main>
      {calls && <IncomingCallWatcher basePath={basePath} />}
    </div>
  );
}
