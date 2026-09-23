import path from "path";
import { mkdir, unlink, writeFile } from "fs/promises";
import { del, put } from "@vercel/blob";

// Uploaded files live outside /public so they are served the same way in dev and production.
export const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
export const AVATAR_DIR = path.join(UPLOAD_ROOT, "avatars");

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
