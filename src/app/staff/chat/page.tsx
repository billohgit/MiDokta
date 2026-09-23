import { requireUser } from "@/lib/auth";
import { STAFF_PORTAL_ROLES } from "@/lib/roles";
import ChatPage from "@/components/chat/ChatPage";

export const dynamic = "force-dynamic";

export default async function StaffChatPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const [user, { c }] = await Promise.all([requireUser(...STAFF_PORTAL_ROLES), searchParams]);
  return <ChatPage user={user} conversationId={c} />;
}
