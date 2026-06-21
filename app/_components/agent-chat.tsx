"use client";

import { useEveAgent } from "eve/react";
import { AlertCircleIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

type Thread = {
  readonly id: string;
  readonly initialMessage: string;
};

export function AgentChat() {
  const [threads, setThreads] = useState<readonly Thread[]>([]);
  const isEmpty = threads.length === 0;

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if (!text) return;

    setThreads((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        initialMessage: text,
      },
    ]);
  };

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
        </header>
      )}

      {isEmpty ? null : (
        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="mx-auto w-full max-w-5xl gap-4 px-4 py-6 sm:px-6">
            {threads.map((thread) => (
              <AgentThread
                initialMessage={thread.initialMessage}
                key={thread.id}
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

function AgentThread({
  initialMessage,
  threadId,
}: {
  readonly initialMessage: string;
  readonly threadId: string;
}) {
  const agent = useEveAgent({
    host: "/api",
    headers: async () => ({
      "x-user-locale": navigator.language,
    }),
  });
  const hasStartedRef = useRef(false);
  const isBusy = agent.status === "submitted" || agent.status === "streaming";

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;
    void agent.send({ message: initialMessage });
  }, [agent, initialMessage]);

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
