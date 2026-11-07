import "server-only";

import path from "path";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import { randomBytes } from "crypto";
import { get, head, issueSignedToken, presignUrl } from "@vercel/blob";
import { UPLOAD_ROOT } from "@/lib/uploads";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES, type AttachmentKind } from "@/components/chat/types";

/**
 * Photos and videos sent in the chat. They can be medical, so they live in the private Blob store
 * (the one identity documents use) and are only ever served to the conversation's members, through
 * /api/chat/attachments/<messageId>, which hands out a link valid for a few minutes.
 *
 * Browsers upload straight to the store (videos are too big to pass through the app's server); the
 * app only issues a short-lived upload token, for a member, into that conversation's folder, for
 * allowed types and sizes. Sending the message then checks the stored file before attaching it.
 *
 * Without a private store (development) files go to uploads/chat on local disk instead.
 */

const LOCAL_DIR = path.join(UPLOAD_ROOT, "chat");
/** How long an upload token, and a viewing link, stay valid. */
const UPLOAD_WINDOW_MS = 15 * 60 * 1000;
const VIEW_WINDOW_MS = 10 * 60 * 1000;

/** File extensions for attachments kept on local disk in development. */
const LOCAL_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/3gpp": "3gpp",
};

const privateToken = () => process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
export const attachmentStorage = (): "blob" | "local" => (privateToken() ? "blob" : "local");

/** Every attachment of a conversation is stored under its own folder. */
export const conversationFolder = (conversationId: string) => `chat/${conversationId}/`;

export const kindOf = (contentType: string | null | undefined): AttachmentKind | null => (contentType ? (ATTACHMENT_TYPES[contentType] ?? null) : null);

/** Upload-token limits for a conversation's folder. */
export function uploadConstraints() {
  return {
    allowedContentTypes: Object.keys(ATTACHMENT_TYPES),
    maximumSizeInBytes: Math.max(...Object.values(ATTACHMENT_MAX_BYTES)),
    validUntil: Date.now() + UPLOAD_WINDOW_MS,
    addRandomSuffix: true,
    token: privateToken(),
  };
}

export type CheckedAttachment = { ref: string; type: string; size: number };

/**
 * Confirms an uploaded file belongs to this conversation and is an allowed photo or video within its
 * size limit, using what the store says about it rather than what the browser claimed.
 */
export async function checkAttachment(conversationId: string, ref: string): Promise<CheckedAttachment | null> {
  const folder = conversationFolder(conversationId);
  if (ref.startsWith("blob:")) {
    const pathname = ref.slice(5);
    if (!pathname.startsWith(folder) || pathname.includes("..") || !privateToken()) return null;
    const info = await head(pathname, { token: privateToken() }).catch(() => null);
    const kind = kindOf(info?.contentType);
    if (!info || !kind || info.size > ATTACHMENT_MAX_BYTES[kind]) return null;
    return { ref, type: info.contentType, size: info.size };
  }
  if (ref.startsWith("local:")) {
    const rel = ref.slice(6);
    if (attachmentStorage() !== "local" || !rel.startsWith(folder) || !/^chat\/[\w-]+\/[\w-]+\.(\w+)$/.test(rel)) return null;
    const type = Object.entries(LOCAL_EXT).find(([, ext]) => ext === path.extname(rel).slice(1))?.[0];
    const info = await stat(path.join(UPLOAD_ROOT, rel)).catch(() => null);
    const kind = kindOf(type);
    if (!info || !type || !kind || info.size > ATTACHMENT_MAX_BYTES[kind]) return null;
    return { ref, type, size: info.size };
  }
  return null;
}

/** A link to the stored file that works for a few minutes. Only for blob-stored attachments. */
export async function viewingLink(ref: string): Promise<string> {
  const pathname = ref.slice(5);
  const validUntil = Date.now() + VIEW_WINDOW_MS;
  const signed = await issueSignedToken({ pathname, operations: ["get"], validUntil, token: privateToken() });
  const { presignedUrl } = await presignUrl(signed, { operation: "get", pathname, validUntil, access: "private" });
  return presignedUrl;
}

/** The file itself, for streaming when a link can't be issued, and for local development. */
export async function readAttachment(ref: string, type: string): Promise<{ body: ReadableStream | Buffer; contentType: string } | null> {
  if (ref.startsWith("local:")) {
    const data = await readFile(path.join(UPLOAD_ROOT, ref.slice(6))).catch(() => null);
    return data ? { body: data, contentType: type } : null;
  }
  const result = await get(ref.slice(5), { access: "private", token: privateToken() }).catch(() => null);
  return result?.stream ? { body: result.stream, contentType: type } : null;
}


/** Development only: keeps an upload on local disk and returns its reference. */
export async function saveLocalAttachment(conversationId: string, file: File): Promise<string | null> {
  const kind = kindOf(file.type);
  if (!kind || file.size > ATTACHMENT_MAX_BYTES[kind]) return null;
  const rel = `${conversationFolder(conversationId)}${randomBytes(12).toString("hex")}.${LOCAL_EXT[file.type]}`;
  await mkdir(path.join(LOCAL_DIR, conversationId), { recursive: true });
  await writeFile(path.join(UPLOAD_ROOT, rel), Buffer.from(await file.arrayBuffer()));
  return `local:${rel}`;
}
