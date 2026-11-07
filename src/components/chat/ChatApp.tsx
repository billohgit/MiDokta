"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { markConversationRead, sendMessage } from "@/app/actions/chat";
import Avatar from "@/components/appointments/Avatar";
import NewChatModal from "./NewChatModal";
import GroupInfoPanel from "./GroupInfoPanel";
import CallButton from "@/components/calls/CallButton";
import { shrinkUpload } from "@/components/ui/ImageCapture";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPES,
  type ChatMessage,
  type ChatUser,
  type ConversationSummary,
  MAX_MESSAGE_LENGTH,
  MAX_SMS_MESSAGE_LENGTH,
  ROLE_LABEL,
  type SmsSummary,
  conversationTitle,
  displayName,
  messagePreview,
} from "./types";

const LIST_POLL_MS = 5000;
const THREAD_POLL_MS = 2500;
/** Photos are shrunk to this many pixels on their longest side before sending, to save mobile data. */
const PHOTO_SIDE = 1600;
/** Videos above this size upload in parts, which survives a flaky connection better. */
const MULTIPART_BYTES = 8 * 1024 * 1024;

type Props = {
  me: ChatUser;
  contacts: ChatUser[];
  initialConversations: ConversationSummary[];
  initialConversationId: string | null;
  /** False when the SMS provider only logs messages (development). */
  smsLive: boolean;
  /** Where photos and videos are uploaded: the private Blob store, or local disk in development. */
  attachments: "blob" | "local";
};

export default function ChatApp({ me, contacts, initialConversations, initialConversationId, smsLive, attachments }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(initialConversationId);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"new" | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations", { cache: "no-store" });
      if (!res.ok) return;
      const data: { conversations: ConversationSummary[] } = await res.json();
      setConversations(data.conversations);
    } catch {
      // Offline for a moment — keep the current list.
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(refreshConversations, LIST_POLL_MS);
    window.addEventListener("focus", refreshConversations);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refreshConversations);
    };
  }, [refreshConversations]);

  const clearUnread = useCallback(
    () => setConversations((list) => list.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c))),
    [activeId]
  );

  const open = useCallback(
    (id: string | null) => {
      setActiveId(id);
      setShowInfo(false);
      router.replace(id ? `${pathname}?c=${id}` : pathname, { scroll: false });
    },
    [pathname, router]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        conversationTitle(c, me.id).toLowerCase().includes(q) ||
        c.participants.some((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q))
    );
  }, [conversations, search, me.id]);

  return (
    <div className={`chat card${activeId ? " show-thread" : ""}`}>
      <aside className="chat-list">
        <div className="chat-list-head">
          <h2>Messages</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setModal("new")}>
            <i className="fa-solid fa-pen-to-square btn-icon" /> New
          </button>
        </div>
        <label className="search chat-search">
          <i className="fa-solid fa-magnifying-glass" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats..." />
        </label>

        <div className="chat-list-items">
          {visible.length === 0 ? (
            <p className="chat-empty-list">
              {conversations.length === 0 ? "No conversations yet. Start one with the New button." : "No chats match your search."}
            </p>
          ) : (
            visible.map((c) => (
              <ConversationRow key={c.id} c={c} me={me} active={c.id === activeId} onClick={() => open(c.id)} />
            ))
          )}
        </div>
      </aside>

      <section className="chat-thread">
        {active ? (
          <Thread
            key={active.id}
            conversation={active}
            me={me}
            smsLive={smsLive}
            attachments={attachments}
            onBack={() => open(null)}
            onToggleInfo={() => setShowInfo((s) => !s)}
            onActivity={refreshConversations}
            onRead={clearUnread}
            basePath={`/${pathname.split("/")[1]}`}
          />
        ) : (
          <div className="chat-placeholder">
            <i className="fa-regular fa-comments" />
            <h3>{activeId ? "Loading conversation..." : "Select a conversation"}</h3>
            <p>
              {me.role === "PATIENT"
                ? "Message your doctors. They reply here, and you can video call them from the chat."
                : "Message colleagues and patients in the app, with an SMS copy for patients who don't sign in."}
            </p>
            <button className="btn btn-primary btn-sm" onClick={() => setModal("new")}>
              Start a new chat
            </button>
          </div>
        )}
      </section>

      {active?.isGroup && showInfo && (
        <GroupInfoPanel
          conversation={active}
          me={me}
          contacts={contacts}
          onClose={() => setShowInfo(false)}
          onChanged={refreshConversations}
          onLeft={() => {
            open(null);
            refreshConversations();
          }}
        />
      )}

      {modal === "new" && (
        <NewChatModal
          contacts={contacts}
          allowGroups={me.role !== "PATIENT"}
          onClose={() => setModal(null)}
          onOpened={async (id) => {
            setModal(null);
            await refreshConversations();
            open(id);
          }}
        />
      )}
    </div>
  );
}

function ConversationRow({ c, me, active, onClick }: { c: ConversationSummary; me: ChatUser; active: boolean; onClick: () => void }) {
  const other = c.participants.find((p) => p.id !== me.id);
  const title = conversationTitle(c, me.id);
  const preview = c.lastMessage
    ? `${c.lastMessage.senderId === me.id ? "You: " : c.isGroup ? `${senderFirstName(c, c.lastMessage.senderId)}: ` : ""}${messagePreview(c.lastMessage)}`
    : c.isGroup
      ? `${c.participants.length} members`
      : "No messages yet";

  return (
    <button className={`chat-row${active ? " active" : ""}${c.unread ? " unread" : ""}`} onClick={onClick}>
      {c.isGroup || !other ? (
        <span className="group-avatar">
          <i className="fa-solid fa-users" />
        </span>
      ) : (
        <Avatar person={other} size={44} />
      )}
      <span className="chat-row-text">
        <span className="chat-row-top">
          <strong>
            {title}
            {!c.isGroup && other && !other.canSignIn && <i className="fa-solid fa-comment-sms sms-only-icon" title="Receives messages by SMS" />}
          </strong>
          {c.lastMessage && <small>{shortTime(c.lastMessage.createdAt)}</small>}
        </span>
        <span className="chat-row-bottom">
          <span className="chat-preview">{preview}</span>
          {c.unread > 0 && <span className="chat-unread">{c.unread > 99 ? "99+" : c.unread}</span>}
        </span>
      </span>
    </button>
  );
}

type ThreadProps = {
  conversation: ConversationSummary;
  me: ChatUser;
  smsLive: boolean;
  attachments: "blob" | "local";
  onBack: () => void;
  onToggleInfo: () => void;
  onActivity: () => void;
  onRead: () => void;
  /** The portal root, e.g. "/doctor", for the call screen's address. */
  basePath: string;
};

function Thread({ conversation, me, smsLive, attachments, onBack, onToggleInfo, onActivity, onRead, basePath }: ThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Patients' messages are never texted (the server enforces it too).
  const [alsoSms, setAlsoSms] = useState(me.role !== "PATIENT");
  // A photo or video chosen to send, and the upload in progress (message id, percent).
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<{ id: string; percent: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const filePreview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const preserveOffset = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const people = useMemo(() => new Map(conversation.participants.map((p) => [p.id, p])), [conversation.participants]);
  const others = conversation.participants.filter((p) => p.id !== me.id);
  const other = others[0];
  const title = conversationTitle(conversation, me.id);

  const smsOnly = others.filter((p) => !p.canSignIn);
  const appUsers = others.filter((p) => p.canSignIn);
  const smsTargets = alsoSms ? others : smsOnly;
  const unreachable = smsTargets.filter((p) => !p.smsReachable && !p.canSignIn);
  const willSms = smsTargets.length > 0;
  const limit = willSms ? MAX_SMS_MESSAGE_LENGTH : MAX_MESSAGE_LENGTH;

  /** Adds messages, replacing any with the same id, kept in time order. */
  const merge = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((current) => {
      const byId = new Map(current.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, { ...byId.get(m.id), ...m });
      return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
  }, []);

  const markRead = useCallback(async () => {
    onRead();
    await markConversationRead(conversation.id);
  }, [conversation.id, onRead]);

  // Initial page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/chat/conversations/${conversation.id}/messages`, { cache: "no-store" });
      if (cancelled) return;
      if (res.ok) {
        const data: { messages: ChatMessage[]; hasMore: boolean } = await res.json();
        setMessages(data.messages);
        setHasMore(data.hasMore);
      } else {
        setError("Couldn't load this conversation.");
      }
      setLoading(false);
      if (conversation.unread > 0) markRead();
    })();
    inputRef.current?.focus();
    return () => {
      cancelled = true;
    };
    // Load once per conversation (the component is keyed by id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll for new messages and for SMS delivery updates on recent messages.
  const latestConfirmed = [...messages].reverse().find((m) => !m.status)?.createdAt;
  const pendingSmsIds = messages
    .filter((m) => m.sms && m.sms.pending > 0 && !m.status)
    .map((m) => m.id)
    .join(",");
  useEffect(() => {
    if (loading) return;
    const timer = setInterval(async () => {
      const after = latestConfirmed ?? new Date(0).toISOString();
      const smsFor = pendingSmsIds ? `&smsFor=${pendingSmsIds}` : "";
      try {
        const res = await fetch(
          `/api/chat/conversations/${conversation.id}/messages?after=${encodeURIComponent(after)}${smsFor}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data: { messages: ChatMessage[]; sms: Record<string, SmsSummary> } = await res.json();
        merge(data.messages);
        if (Object.keys(data.sms).length) {
          setMessages((list) => list.map((m) => (data.sms[m.id] ? { ...m, sms: data.sms[m.id] } : m)));
        }
        const fresh = data.messages.filter((m) => m.senderId !== me.id);
        if (fresh.some((m) => !latestConfirmed || m.createdAt > latestConfirmed)) {
          markRead();
          onActivity();
        }
      } catch {
        // Try again on the next tick.
      }
    }, THREAD_POLL_MS);
    return () => clearInterval(timer);
  }, [conversation.id, latestConfirmed, pendingSmsIds, loading, me.id, merge, markRead, onActivity]);

  // Keep the view pinned to the newest message unless the user has scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (preserveOffset.current !== null) {
      el.scrollTop = el.scrollHeight - preserveOffset.current;
      preserveOffset.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, loading]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadOlder = async () => {
    const oldest = messages.find((m) => !m.status);
    if (!oldest || !scroller.current) return;
    setLoadingOlder(true);
    preserveOffset.current = scroller.current.scrollHeight - scroller.current.scrollTop;
    const res = await fetch(
      `/api/chat/conversations/${conversation.id}/messages?before=${encodeURIComponent(oldest.createdAt)}`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const data: { messages: ChatMessage[]; hasMore: boolean } = await res.json();
      merge(data.messages);
      setHasMore(data.hasMore);
    } else {
      preserveOffset.current = null;
    }
    setLoadingOlder(false);
  };

  /** Puts the chosen file in storage and returns its reference. */
  const uploadFile = async (id: string, f: File): Promise<string> => {
    setUploading({ id, percent: 0 });
    try {
      if (attachments === "local") {
        const form = new FormData();
        form.set("conversationId", conversation.id);
        form.set("file", f);
        const res = await fetch("/api/chat/attachments/local", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ref) throw new Error(data.error ?? "Upload failed.");
        return data.ref as string;
      }
      const { upload } = await import("@vercel/blob/client");
      const safeName = f.name.replace(/[^\w.-]+/g, "_").slice(-60) || "file";
      const blob = await upload(`chat/${conversation.id}/${safeName}`, f, {
        access: "private",
        handleUploadUrl: "/api/chat/attachments/upload",
        clientPayload: conversation.id,
        contentType: f.type,
        multipart: f.size > MULTIPART_BYTES,
        onUploadProgress: ({ percentage }) => setUploading({ id, percent: Math.round(percentage) }),
      });
      return `blob:${blob.pathname}`;
    } finally {
      setUploading(null);
    }
  };

  const deliver = async (temp: ChatMessage) => {
    let ref = temp.attachmentRef;
    if (temp.pendingFile && !ref) {
      try {
        ref = await uploadFile(temp.id, temp.pendingFile);
        setMessages((list) => list.map((m) => (m.id === temp.id ? { ...m, attachmentRef: ref } : m)));
      } catch (e) {
        setMessages((list) => list.map((m) => (m.id === temp.id ? { ...m, status: "failed" as const } : m)));
        setError(e instanceof Error && e.message ? `Couldn't upload: ${e.message}` : "Couldn't upload. Check your connection and tap retry.");
        return;
      }
    }
    const attachment = ref ? { ref, name: temp.pendingFile?.name ?? null } : undefined;
    // A dropped connection rejects rather than returning a result; treat it as a failed send so the
    // bubble offers a retry instead of staying on "sending".
    const result = await sendMessage(conversation.id, temp.body, alsoSms, attachment).catch(() => ({
      ok: false as const,
      error: "Couldn't send. Check your connection and tap retry.",
    }));
    setMessages((list) => {
      if (!result.ok) return list.map((m) => (m.id === temp.id ? { ...m, status: "failed" as const } : m));
      const rest = list.filter((m) => m.id !== temp.id);
      return rest.some((m) => m.id === result.message.id)
        ? rest
        : [...rest, result.message].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
    if (result.ok) {
      setError(null);
      setNotice(
        result.smsSkipped > 0
          ? `${result.smsSkipped} ${result.smsSkipped === 1 ? "person" : "people"} couldn't be texted (no valid phone number or opted out of SMS).`
          : null
      );
      onActivity();
    } else {
      setError(result.error);
    }
  };

  /** Checks a chosen photo or video, shrinking photos first. */
  const choose = async (f: File | undefined) => {
    if (fileInput.current) fileInput.current.value = "";
    if (!f) return;
    const kind = ATTACHMENT_TYPES[f.type] ?? (f.type.startsWith("image/") ? "image" : null);
    if (!kind) return setError("Send a photo (JPG, PNG, WebP, GIF) or a video (MP4, WebM, MOV, 3GP).");
    let chosen = f;
    if (kind === "image" && f.type !== "image/gif") {
      try {
        chosen = await shrinkUpload(f, f.name.replace(/\.\w+$/, "") + ".jpg", PHOTO_SIDE);
      } catch {
        return setError("That photo couldn't be read. Try a JPG or PNG.");
      }
    }
    if (chosen.size > ATTACHMENT_MAX_BYTES[kind]) {
      return setError(`${kind === "video" ? "Videos" : "Photos"} can be up to ${ATTACHMENT_MAX_BYTES[kind] / 1024 / 1024} MB. Try a shorter video.`);
    }
    setError(null);
    setFile(chosen);
  };

  const send = () => {
    const body = draft.trim();
    if (!body && !file) return;
    if (body.length > limit) {
      setError(`Messages ${willSms ? "sent by SMS " : ""}are limited to ${limit} characters.`);
      return;
    }
    const temp: ChatMessage = {
      id: `temp-${crypto.randomUUID()}`,
      conversationId: conversation.id,
      senderId: me.id,
      body,
      createdAt: new Date().toISOString(),
      source: "APP",
      sms: null,
      attachment: file && filePreview ? { kind: ATTACHMENT_TYPES[file.type] ?? "image", url: filePreview, name: file.name, size: file.size } : null,
      pendingFile: file ?? undefined,
      status: "sending",
    };
    stickToBottom.current = true;
    setMessages((list) => [...list, temp]);
    setDraft("");
    setFile(null);
    deliver(temp);
  };

  const retry = (m: ChatMessage) => {
    setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, status: "sending" } : x)));
    deliver(m);
  };

  const subtitle = conversation.isGroup
    ? conversation.participants.map((p) => (p.id === me.id ? "You" : p.firstName)).join(", ")
    : other
      ? other.canSignIn
        ? ROLE_LABEL[other.role]
        : `${ROLE_LABEL[other.role]} · ${other.smsReachable ? "receives your messages by SMS" : "no phone number for SMS"}`
      : "";

  return (
    <>
      <header className="thread-head">
        <button className="icon-btn thread-back" onClick={onBack} aria-label="Back to conversations">
          <i className="fa-solid fa-arrow-left" />
        </button>
        {conversation.isGroup || !other ? (
          <span className="group-avatar">
            <i className="fa-solid fa-users" />
          </span>
        ) : (
          <Avatar person={other} size={42} />
        )}
        <div className="thread-title">
          <strong>{title}</strong>
          <small className={other && !other.canSignIn && !other.smsReachable && !conversation.isGroup ? "warn-text" : undefined}>
            {subtitle}
          </small>
        </div>
        {!conversation.isGroup && other && callable(me, other) && (
          <CallButton calleeId={other.id} name={displayName(other)} basePath={basePath} compact />
        )}
        {conversation.isGroup && (
          <button className="icon-btn" onClick={onToggleInfo} aria-label="Group info" title="Group info">
            <i className="fa-solid fa-circle-info" />
          </button>
        )}
      </header>

      <div className="thread-messages" ref={scroller} onScroll={onScroll}>
        {loading ? (
          <p className="chat-empty-list">Loading messages...</p>
        ) : (
          <>
            {hasMore && (
              <button className="link-btn load-older" onClick={loadOlder} disabled={loadingOlder}>
                {loadingOlder ? "Loading..." : "Load earlier messages"}
              </button>
            )}
            {messages.length === 0 && (
              <p className="chat-empty-list">No messages yet. Say hello to {conversation.isGroup ? "the group" : title}.</p>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const mine = m.senderId === me.id;
              const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
              const firstInRun = newDay || !prev || prev.senderId !== m.senderId;
              const sender = people.get(m.senderId);
              return (
                <div key={m.id}>
                  {newDay && <div className="day-divider">{dayLabel(m.createdAt)}</div>}
                  <div className={`bubble-row${mine ? " mine" : ""}${firstInRun ? " first" : ""}`}>
                    <div className={`bubble${m.status ? ` ${m.status}` : ""}`}>
                      {conversation.isGroup && !mine && firstInRun && (
                        <span className="bubble-sender">{sender ? displayName(sender) : "Former member"}</span>
                      )}
                      {m.attachment && <Attachment attachment={m.attachment} />}
                      {m.body && <span className="bubble-body">{m.body}</span>}
                      <span className="bubble-meta">
                        {m.source === "SMS" && (
                          <span className="bubble-sms" title="Received by SMS">
                            <i className="fa-solid fa-comment-sms" /> via SMS ·{" "}
                          </span>
                        )}
                        {m.status === "sending" ? (
                          uploading?.id === m.id ? (
                            <span>Uploading {uploading.percent}%</span>
                          ) : (
                            <i className="fa-regular fa-clock" aria-label="Sending" />
                          )
                        ) : m.status === "failed" ? (
                          <button className="bubble-retry" onClick={() => retry(m)}>
                            <i className="fa-solid fa-rotate-right" /> Retry
                          </button>
                        ) : (
                          shortTime(m.createdAt, true)
                        )}
                        {mine && m.sms && <SmsStatus summary={m.sms} live={smsLive} />}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {error && <p className="form-error composer-error">{error}</p>}
        {notice && !error && <p className="composer-note warn-text">{notice}</p>}
        <div className="composer-options">
          {appUsers.length > 0 && me.role !== "PATIENT" && (
            <label className="checkbox-line compact">
              <input type="checkbox" checked={alsoSms} onChange={(e) => setAlsoSms(e.target.checked)} />
              {smsOnly.length > 0 ? "Also text app users" : "Also send by SMS"}
            </label>
          )}
          {willSms && (
            <span className="composer-sms-note">
              <i className="fa-solid fa-comment-sms" />{" "}
              {smsOnly.length > 0 && !alsoSms
                ? `Sent by SMS to ${smsOnly.length === 1 ? smsOnly[0].firstName : `${smsOnly.length} people`} without app access`
                : `Sent by SMS to ${smsTargets.length === 1 ? smsTargets[0].firstName : `${smsTargets.length} people`}`}
              {unreachable.length > 0 && <span className="warn-text"> ({unreachable.length} without a phone)</span>}
              {!smsLive && <span className="warn-text"> · test mode: SMS is logged, not delivered</span>}
            </span>
          )}
          {willSms && (
            <span className={`composer-count${draft.length > limit ? " warn-text" : ""}`}>
              {draft.length}/{limit}
            </span>
          )}
        </div>
        {file && filePreview && (
          <div className="composer-attachment">
            {ATTACHMENT_TYPES[file.type] === "video" ? (
              <video src={filePreview} muted playsInline />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={filePreview} alt="" />
            )}
            <span>
              {file.name}
              <small>
                {(file.size / 1024 / 1024).toFixed(1)} MB{willSms ? " · SMS recipients are told to open MiDokta to see it" : ""}
              </small>
            </span>
            <button type="button" className="icon-btn" onClick={() => setFile(null)} aria-label="Remove attachment">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        )}
        <button
          type="button"
          className="icon-btn composer-attach"
          onClick={() => fileInput.current?.click()}
          aria-label="Attach a photo or video"
          title="Attach a photo or video"
        >
          <i className="fa-solid fa-paperclip" />
        </button>
        <input ref={fileInput} type="file" accept="image/*,video/*" hidden onChange={(e) => choose(e.target.files?.[0])} />
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={file ? "Add a caption (optional)" : "Type a message... (Enter to send, Shift+Enter for a new line)"}
          aria-label="Message"
        />
        <button type="submit" className="btn btn-primary composer-send" disabled={!draft.trim() && !file} aria-label="Send">
          <i className="fa-solid fa-paper-plane" />
        </button>
      </form>
    </>
  );
}

/** A photo (tap to open full size) or a video, inside a message bubble. */
function Attachment({ attachment: a }: { attachment: NonNullable<ChatMessage["attachment"]> }) {
  if (a.kind === "video") {
    return <video className="bubble-media" src={a.url} controls preload="metadata" playsInline />;
  }
  return (
    <a href={a.url} target="_blank" rel="noreferrer" className="bubble-media-link">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="bubble-media" src={a.url} alt={a.name ?? "Photo"} loading="lazy" />
    </a>
  );
}

function SmsStatus({ summary: s, live }: { summary: SmsSummary; live: boolean }) {
  if (s.total === 0) return null;
  let label: string;
  let icon = "fa-comment-sms";
  if (s.pending > 0) {
    label = "SMS sending";
    icon = "fa-hourglass-half";
  } else if (s.failed > 0) {
    label = `SMS failed (${s.failed})`;
    icon = "fa-triangle-exclamation";
  } else if (s.sent === 0) {
    label = "SMS not sent";
    icon = "fa-ban";
  } else if (!live) {
    // Test mode: the provider only logs messages, so nothing reached a phone.
    label = "SMS not delivered (test mode)";
    icon = "fa-flask";
  } else {
    label = s.skipped ? `SMS sent to ${s.sent} of ${s.total}` : "SMS sent";
    icon = "fa-check";
  }
  return (
    <span
      className={`bubble-sms-status${s.failed || (s.sent === 0 && s.pending === 0) ? " bad" : ""}`}
      title={`${s.sent} sent, ${s.pending} sending, ${s.failed} failed, ${s.skipped} skipped (no phone or opted out)`}
    >
      {" · "}
      <i className={`fa-solid ${icon}`} /> {label}
    </span>
  );
}

/** Doctors video call their patients from the chat, and patients their doctors. */
const callable = (me: ChatUser, other: ChatUser) =>
  (me.role === "DOCTOR" && other.role === "PATIENT") || (me.role === "PATIENT" && other.role === "DOCTOR");

function senderFirstName(c: ConversationSummary, id: string) {
  return c.participants.find((p) => p.id === id)?.firstName ?? "Someone";
}

const dayKey = (iso: string) => new Date(iso).toDateString();

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/** Time for today, otherwise a short date. `timeOnly` always shows the time. */
function shortTime(iso: string, timeOnly = false) {
  const d = new Date(iso);
  if (timeOnly || d.toDateString() === new Date().toDateString()) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
