"use client";

import { useRouter } from "next/navigation";
import { startDirectConversation } from "@/app/actions/chat";
import useServerAction from "@/components/ui/useServerAction";

/** Opens (or starts) the chat with one person. */
export default function MessageButton({ userId, basePath }: { userId: string; basePath: string }) {
  const router = useRouter();
  const { busy, error, run } = useServerAction();

  return (
    <>
      {error && <small className="form-error">{error}</small>}
      <button
        type="button"
        className="btn btn-sm btn-outline"
        disabled={busy}
        onClick={() => run(() => startDirectConversation(userId), { onSuccess: (r) => router.push(`${basePath}/chat?c=${r.id}`) })}
      >
        <i className="fa-regular fa-comment btn-icon" /> {busy ? "Opening..." : "Message"}
      </button>
    </>
  );
}
