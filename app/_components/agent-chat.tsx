"use client";

import { useEveAgent } from "eve/react";
import type { HandleMessageStreamEvent, SessionState } from "eve/client";
import { AlertCircleIcon, Trash2Icon, XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";
import { AgentMessage } from "./agent-message";

const AGENT_NAME = "guy";
const BETA_TERMS_HREF =
  "https://vercel.com/docs/release-phases/public-beta-agreement";

type AgentStatus = ReturnType<typeof useEveAgent>["status"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ThreadSessionState {
  readonly sessionId?: string;
  readonly continuationToken?: string;
  readonly streamIndex: number;
}

interface Thread {
  readonly id: string;
  readonly initialMessage: string;
  readonly sessionState: ThreadSessionState | null;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const API_BASE = "/api/threads";

async function loadThreads(): Promise<readonly Thread[]> {
  try {
    const res = await fetch(API_BASE);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      ok: boolean;
      threads?: readonly {
        id: string;
        initialMessage: string;
        sessionId: string | null;
        continuationToken: string | null;
        streamIndex: number;
      }[];
    };
    if (!json.ok || !json.threads) return [];

    return json.threads.map((t) => ({
      id: t.id,
      initialMessage: t.initialMessage,
      sessionState:
        t.sessionId && t.continuationToken
          ? {
              sessionId: t.sessionId,
              continuationToken: t.continuationToken,
              streamIndex: t.streamIndex,
            }
          : null,
    }));
  } catch {
    return [];
  }
}

async function saveThread(
  thread: Thread,
): Promise<void> {
  try {
    await fetch(API_BASE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: thread.id,
        initialMessage: thread.initialMessage,
        sessionId: thread.sessionState?.sessionId ?? null,
        continuationToken: thread.sessionState?.continuationToken ?? null,
        streamIndex: thread.sessionState?.streamIndex ?? 0,
      }),
    });
  } catch {
    // Silently fail — state will be retried on next change
  }
}

async function deleteThreadFromServer(
  id: string,
): Promise<void> {
  try {
    await fetch(`${API_BASE}?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  } catch {
    // Silently fail
  }
}

// ---------------------------------------------------------------------------
// AgentChat (page-level)
// ---------------------------------------------------------------------------

export function AgentChat() {
  const [threads, setThreads] = useState<readonly Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const isEmpty = threads.length === 0 && !loading;

  // Load threads on mount
  useEffect(() => {
    void loadThreads().then((loaded) => {
      setThreads((current) => {
        // Merge: keep any threads created locally while loading
        const loadedIds = new Set(loaded.map((t) => t.id));
        const localOnly = current.filter((t) => !loadedIds.has(t.id));
        return [...loaded, ...localOnly];
      });
      setLoading(false);
    });
  }, []);

  const handleSubmit = useCallback((message: PromptInputMessage) => {
    const text = message.text.trim();
    if (!text) return;

    const newThread: Thread = {
      id: crypto.randomUUID(),
      initialMessage: text,
      sessionState: null,
    };

    setThreads((current) => [...current, newThread]);

    // Save the new thread (no session state yet)
    void saveThread(newThread);
  }, []);

  const handleSessionChange = useCallback(
    (threadId: string, session: SessionState) => {
      setThreads((current) => {
        const updated = current.map((t) =>
          t.id === threadId
            ? {
                ...t,
                sessionState: {
                  sessionId: session.sessionId,
                  continuationToken: session.continuationToken,
                  streamIndex: session.streamIndex,
                },
              }
            : t,
        );
        // Persist session state to server
        const thread = updated.find((t) => t.id === threadId);
        if (thread) void saveThread(thread);
        return updated;
      });
    },
    [],
  );

  const handleDeleteThread = useCallback((threadId: string) => {
    setThreads((current) => current.filter((t) => t.id !== threadId));
    void deleteThreadFromServer(threadId);
  }, []);

  const handleClearAll = useCallback(() => {
    const ids = threads.map((t) => t.id);
    setThreads([]);
    for (const id of ids) {
      void deleteThreadFromServer(id);
    }
  }, [threads]);

  const composer = (
    <PromptInput onSubmit={handleSubmit}>
      <PromptInputTextarea placeholder="Send a message…" />
      <PromptInputSubmit status="ready" />
    </PromptInput>
  );

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {isEmpty ? null : (
        <header className="flex h-14 shrink-0 items-center justify-center gap-3 pl-4 pr-2">
          <span className="truncate text-muted-foreground text-sm">
            {AGENT_NAME}
          </span>
          <a
            className="rounded-full border border-amber-500/30 px-2 py-0.5 font-medium text-amber-700 text-xs transition-colors hover:bg-amber-500/10 dark:text-amber-300"
            href={BETA_TERMS_HREF}
            rel="noreferrer"
            target="_blank"
          >
            Public preview
          </a>
          <button
            className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
            onClick={handleClearAll}
            title="Clear all conversations"
            type="button"
          >
            <Trash2Icon className="size-3" />
            Clear all
          </button>
        </header>
      )}

      {isEmpty ? null : (
        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="mx-auto w-full max-w-5xl gap-4 px-4 py-6 sm:px-6">
            {threads.map((thread) => (
              <AgentThread
                initialMessage={thread.initialMessage}
                initialSession={thread.sessionState ?? undefined}
                key={thread.id}
                onDelete={handleDeleteThread}
                onSessionChange={(session) =>
                  handleSessionChange(thread.id, session)
                }
                threadId={thread.id}
              />
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      <div
        className={cn(
          "mx-auto w-full px-4 sm:px-6",
          isEmpty
            ? "flex max-w-xl flex-1 flex-col items-center justify-center gap-8 pb-[10vh]"
            : "max-w-3xl shrink-0 pb-6",
        )}
      >
        {isEmpty ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <h1 className="font-medium text-5xl tracking-tighter">
              {AGENT_NAME}
            </h1>
            <a
              className="rounded-full border border-amber-500/30 px-2 py-0.5 font-medium text-amber-700 text-xs transition-colors hover:bg-amber-500/10 dark:text-amber-300"
              href={BETA_TERMS_HREF}
              rel="noreferrer"
              target="_blank"
            >
              Public preview
            </a>
          </div>
        ) : null}
        <div className="w-full">{composer}</div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// AgentThread (one conversation)
// ---------------------------------------------------------------------------

function AgentThread({
  initialMessage,
  initialSession,
  onDelete,
  onSessionChange,
  threadId,
}: {
  readonly initialMessage: string;
  readonly initialSession?: SessionState;
  readonly onDelete: (threadId: string) => void;
  readonly onSessionChange: (session: SessionState) => void;
  readonly threadId: string;
}) {
  // For resumed threads, fetch past events from the durably-stored eve server
  // stream so the reducer can reconstruct full message history.
  const [streamEvents, setStreamEvents] = useState<
    readonly HandleMessageStreamEvent[] | undefined
  >(undefined);
  const fetchingRef = useRef(false);

  // Track whether this thread was loaded from the DB with a saved session
  // (resumed) versus created fresh by the user (new).  Only resumed threads
  // should ever show the "Restoring conversation…" state.
  const hadSessionOnMountRef = useRef(!!initialSession);

  // Stabilize initialSession so useEveAgent doesn't re-initialize its store
  // when the parent re-renders with a new prop reference.
  const stableSessionRef = useRef(initialSession);
  if (stableSessionRef.current === undefined && initialSession !== undefined) {
    stableSessionRef.current = initialSession;
  }
  const stableSession = stableSessionRef.current;

  useEffect(() => {
    if (!stableSession?.sessionId) return;
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    const fetchPastEvents = async () => {
      try {
        const sid = stableSession.sessionId;
        if (!sid) throw new Error("No session ID");
        const url = `/api/eve/v1/session/${encodeURIComponent(sid)}/stream?startIndex=0`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Stream fetch failed: ${response.status}`);

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        const events: HandleMessageStreamEvent[] = [];
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              events.push(JSON.parse(trimmed) as HandleMessageStreamEvent);
            } catch {
              // skip malformed lines
            }
          }
        }

        setStreamEvents(events);
      } catch {
        // Stream failed — session may have expired or been cleaned up.
        setStreamEvents([]);
      }
    };

    void fetchPastEvents();
  }, [stableSession?.sessionId]);

  // -----------------------------------------------------------------------
  // Restoring branch — events not loaded yet, show skeleton
  // -----------------------------------------------------------------------

  const isRestoring =
    hadSessionOnMountRef.current && streamEvents === undefined;

  if (isRestoring) {
    return (
      <section
        className="flex h-[36rem] min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/80 shadow-sm"
        data-thread-id={threadId}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{initialMessage}</p>
            <p className="mt-0.5 text-muted-foreground text-xs">
              Restoring conversation…
            </p>
          </div>
          <button
            className="flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => onDelete(threadId)}
            title="Close conversation"
            type="button"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      </section>
    );
  }

  // -----------------------------------------------------------------------
  // Active branch — events are available (or this is a new thread), mount
  // the real agent UI.  useEveAgent only lives inside ActiveAgentThread so
  // it always receives a defined initialEvents on construction.
  // -----------------------------------------------------------------------

  return (
    <ActiveAgentThread
      initialEvents={streamEvents ?? []}
      initialMessage={initialMessage}
      initialSession={stableSession}
      onDelete={onDelete}
      onSessionChange={onSessionChange}
      threadId={threadId}
    />
  );
}

// ---------------------------------------------------------------------------
// ActiveAgentThread — only rendered when events are ready, so useEveAgent
// always gets its events on first mount and never needs to re-initialize.
// ---------------------------------------------------------------------------

function ActiveAgentThread({
  initialEvents,
  initialMessage,
  initialSession,
  onDelete,
  onSessionChange,
  threadId,
}: {
  readonly initialEvents: readonly HandleMessageStreamEvent[];
  readonly initialMessage: string;
  readonly initialSession?: SessionState;
  readonly onDelete: (threadId: string) => void;
  readonly onSessionChange: (session: SessionState) => void;
  readonly threadId: string;
}) {
  const agent = useEveAgent({
    host: "/api",
    headers: async () => ({
      "x-user-locale": navigator.language,
    }),
    initialSession,
    initialEvents,
    onSessionChange,
  });
  const hasStartedRef = useRef(false);
  const isBusy = agent.status === "submitted" || agent.status === "streaming";

  // Only auto-send for *new* threads (no saved session)
  useEffect(() => {
    if (initialSession) return; // Resuming an existing session — don't re-send
    if (hasStartedRef.current) return;

    hasStartedRef.current = true;
    void agent.send({ message: initialMessage });
  }, [agent, initialMessage, initialSession]);

  const handleReply = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if (!text || isBusy) return;

    await agent.send({ message: text });
  };

  return (
    <section
      className="flex h-[36rem] min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/80 shadow-sm"
      data-thread-id={threadId}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="truncate font-medium text-sm">{initialMessage}</p>
          <p className="mt-0.5 text-muted-foreground text-xs">
            Replies stay in this thread.
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2 text-muted-foreground text-xs">
          <StatusDot status={agent.status} />
          {isBusy ? "Running" : "Ready"}
        </span>
        <button
          className="flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => onDelete(threadId)}
          title="Close conversation"
          type="button"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      {agent.error ? (
        <div className="px-4 pt-4 sm:px-5">
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Request failed</p>
              <p className="mt-0.5 text-muted-foreground">
                {agent.error.message}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-5 px-4 py-4 sm:px-5">
          {agent.data.messages.map((message, index) => (
            <AgentMessage
              canRespond={!isBusy}
              isStreaming={
                agent.status === "streaming" &&
                index === agent.data.messages.length - 1
              }
              key={message.id}
              message={message}
              onInputResponses={(inputResponses) =>
                agent.send({ inputResponses })
              }
            />
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border/70 px-4 py-4 sm:px-5">
        <PromptInput onSubmit={handleReply}>
          <PromptInputTextarea placeholder="Reply in thread…" />
          <PromptInputSubmit onStop={agent.stop} status={agent.status} />
        </PromptInput>
      </div>
    </section>
  );
}

function StatusDot({ status }: { readonly status: AgentStatus }) {
  const isLive = status === "submitted" || status === "streaming";
  const tone =
    status === "error"
      ? "bg-destructive"
      : isLive
        ? "bg-emerald-500"
        : status === "ready"
          ? "bg-muted-foreground"
          : "bg-muted-foreground/50";

  return (
    <span className="relative flex size-1">
      {isLive ? (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-75",
            tone,
          )}
        />
      ) : null}
      <span
        className={cn(
          "relative inline-flex size-1 rounded-full transition-colors",
          tone,
        )}
      />
    </span>
  );
}
