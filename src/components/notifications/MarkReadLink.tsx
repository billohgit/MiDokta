"use client";

import Link from "next/link";
import { markNotificationRead } from "@/app/actions/notifications";

type Props = { id: string; href: string; unread: boolean; className: string; children: React.ReactNode };

export default function MarkReadLink({ id, href, unread, className, children }: Props) {
  return (
    <Link href={href} className={className} onClick={() => unread && markNotificationRead(id)}>
      {children}
    </Link>
  );
}
