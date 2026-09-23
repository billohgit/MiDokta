import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import ChatPage from "@/components/chat/ChatPage";

export const dynamic = "force-dynamic";

export default async function AdminChatPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const [user, { c }] = await Promise.all([requireUser(Role.ADMIN), searchParams]);
  return <ChatPage user={user} conversationId={c} />;
}
