import type { MessageSource, Role } from "@prisma/client";

export type ChatUser = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: Role;
  /** Has a portal to read messages in; everyone else is reached by SMS only. */
  canSignIn: boolean;
  /** Has a valid phone number and hasn't opted out of SMS. */
  smsReachable: boolean;
};

/** Delivery of one chat message's SMS copies. */
export type SmsSummary = { total: number; sent: number; pending: number; failed: number; skipped: number };

export type AttachmentKind = "image" | "video";

/** A photo or video sent in the chat. `url` is the app's own link, which checks the viewer is in the conversation. */
export type ChatAttachment = { kind: AttachmentKind; url: string; name: string | null; size: number | null };

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  source: MessageSource;
  sms: SmsSummary | null;
  attachment: ChatAttachment | null;
  /** Client-only: optimistic message still sending, or failed to send. */
  status?: "sending" | "failed";
  /** Client-only, while sending: the chosen file, and its stored reference once uploaded. */
  pendingFile?: File;
  attachmentRef?: string;
};

/** The photos and videos that can be sent, by content type. */
export const ATTACHMENT_TYPES: Record<string, AttachmentKind> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
  "video/3gpp": "video",
};
/** Photos are shrunk on the phone before sending, so their limit is rarely reached. */
export const ATTACHMENT_MAX_BYTES: Record<AttachmentKind, number> = { image: 10 * 1024 * 1024, video: 50 * 1024 * 1024 };

/** How a message reads in a one-line preview (the conversation list). */
export const messagePreview = (m: { body: string; attachmentKind?: AttachmentKind | null }) =>
  m.body || (m.attachmentKind === "video" ? "🎥 Video" : m.attachmentKind === "image" ? "📷 Photo" : "");

export type ConversationSummary = {
  id: string;
  isGroup: boolean;
  title: string | null;
  /** Everyone in the conversation, including the current user. */
  participants: ChatUser[];
  lastMessage: { body: string; attachmentKind: AttachmentKind | null; senderId: string; createdAt: string } | null;
  lastMessageAt: string;
  unread: number;
};

export const MAX_MESSAGE_LENGTH = 4000;
/** Messages that go out by SMS are capped at about three segments. */
export const MAX_SMS_MESSAGE_LENGTH = 450;


export const displayName = (u: Pick<ChatUser, "firstName" | "lastName" | "role">) =>
  `${u.role === "DOCTOR" ? "Dr. " : ""}${u.firstName} ${u.lastName}`;

/** Title shown for a conversation from `meId`'s point of view. */
export function conversationTitle(c: ConversationSummary, meId: string) {
  if (c.isGroup) return c.title ?? "Group";
  const other = c.participants.find((p) => p.id !== meId);
  return other ? displayName(other) : "Just you";
}

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  DOCTOR: "Doctor",
  NURSE: "Nurse",
  PHARMACIST: "Pharmacist",
  RECEPTIONIST: "Receptionist",
  PATIENT: "Patient",
};
