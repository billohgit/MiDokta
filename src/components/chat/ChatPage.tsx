import type { User } from "@prisma/client";
import { chatContacts, listConversations } from "@/lib/chat";
import { getSmsProvider } from "@/lib/sms/providers";
import { PORTAL_ROLES } from "@/lib/roles";
import ChatApp from "./ChatApp";

/** Server wrapper shared by the admin, doctor and staff chat pages. */
export default async function ChatPage({ user, conversationId }: { user: User; conversationId?: string }) {
  const [conversations, contacts] = await Promise.all([listConversations(user.id), chatContacts(user)]);
  const initial = conversationId && conversations.some((c) => c.id === conversationId) ? conversationId : null;

  return (
    <ChatApp
      me={{
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        role: user.role,
        canSignIn: PORTAL_ROLES.includes(user.role),
        smsReachable: false,
      }}
      contacts={contacts}
      initialConversations={conversations}
      initialConversationId={initial}
      smsLive={getSmsProvider().live}
    />
  );
}
