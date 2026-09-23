import path from "path";

// Uploaded files live outside /public so they are served the same way in dev and production.
export const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
export const AVATAR_DIR = path.join(UPLOAD_ROOT, "avatars");

export const AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
