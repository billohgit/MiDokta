import path from "path";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { del, get, put } from "@vercel/blob";

// Uploaded files live outside /public so they are served the same way in dev and production.
export const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
export const AVATAR_DIR = path.join(UPLOAD_ROOT, "avatars");
// Identity documents are never served by a public route; see readIdCard.
export const ID_CARD_DIR = path.join(UPLOAD_ROOT, "id-cards");

export const AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Serverless hosts give us a read-only filesystem, so uploads go to Vercel Blob whenever a
// token is configured and fall back to local disk for development.
const useBlobStore = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

const LOCAL_AVATAR = /^\/api\/uploads\/avatars\/([\w-]+\.\w+)$/;

/** Stores the image and returns the URL to record on the user. */
export async function saveAvatar(filename: string, file: File): Promise<string> {
  if (useBlobStore()) {
    // The random suffix keeps one patient's photo from being guessable off another's URL.
    const { url } = await put(`avatars/${filename}`, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: true,
    });
    return url;
  }

  await mkdir(AVATAR_DIR, { recursive: true });
  await writeFile(path.join(AVATAR_DIR, filename), Buffer.from(await file.arrayBuffer()));
  return `/api/uploads/avatars/${filename}`;
}

/** Removes a previous upload, ignoring any URL we did not store ourselves. */
export async function deleteAvatar(url: string | null | undefined): Promise<void> {
  if (!url) return;

  const local = url.match(LOCAL_AVATAR)?.[1];
  if (local) {
    await unlink(path.join(AVATAR_DIR, local)).catch(() => {});
    return;
  }

  if (useBlobStore() && url.startsWith("https://")) await del(url).catch(() => {});
}

const LOCAL_ID_CARD = /^local:id-cards\/([\w-]+\.\w+)$/;

/**
 * Stores an identity document privately and returns a reference to record on the user.
 * It is not a browsable URL: read it back with readIdCard, behind an admin check.
 */
export async function saveIdCard(filename: string, file: File): Promise<string> {
  if (useBlobStore()) {
    const { url } = await put(`id-cards/${filename}`, file, {
      access: "private",
      contentType: file.type,
      addRandomSuffix: true,
    });
    return url;
  }

  await mkdir(ID_CARD_DIR, { recursive: true });
  await writeFile(path.join(ID_CARD_DIR, filename), Buffer.from(await file.arrayBuffer()));
  return `local:id-cards/${filename}`;
}

/** The bytes of a stored identity document, or null if it's missing. */
export async function readIdCard(ref: string): Promise<{ data: Buffer; contentType: string } | null> {
  const local = ref.match(LOCAL_ID_CARD)?.[1];
  if (local) {
    const ext = path.extname(local).slice(1);
    const contentType = Object.entries(AVATAR_TYPES).find(([, e]) => e === ext)?.[0];
    if (!contentType) return null;
    const data = await readFile(path.join(ID_CARD_DIR, local)).catch(() => null);
    return data && { data, contentType };
  }

  if (!useBlobStore() || !ref.startsWith("https://")) return null;
  const result = await get(ref, { access: "private" });
  if (result?.statusCode !== 200) return null;
  const data = Buffer.from(await new Response(result.stream).arrayBuffer());
  return { data, contentType: result.blob.contentType ?? "image/jpeg" };
}

export async function deleteIdCard(ref: string | null | undefined): Promise<void> {
  if (!ref) return;
  const local = ref.match(LOCAL_ID_CARD)?.[1];
  if (local) {
    await unlink(path.join(ID_CARD_DIR, local)).catch(() => {});
    return;
  }
  if (useBlobStore() && ref.startsWith("https://")) await del(ref).catch(() => {});
}

/** The bytes of a stored avatar (local or Vercel Blob), for server-side processing. */
export async function readAvatar(url: string): Promise<{ data: Buffer; contentType: string } | null> {
  const local = url.match(LOCAL_AVATAR)?.[1];
  if (local) {
    const ext = path.extname(local).slice(1);
    const contentType = Object.entries(AVATAR_TYPES).find(([, e]) => e === ext)?.[0];
    const data = await readFile(path.join(AVATAR_DIR, local)).catch(() => null);
    return data && contentType ? { data, contentType } : null;
  }
  if (!url.startsWith("https://")) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  return { data: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "image/jpeg" };
}
