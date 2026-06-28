// The poll loop: bridge Raft ↔ eve.
//
// Topology (per project decision):
//   Raft server  ─CLI→  runner  ─HTTP→  eve agent
//
// Per raft.md operating semantics:
//   - Claim-before-work: never start a task without a successful claim.
//   - Author-owned state: the runner's ack/progress/summary posts go to the
//     task's thread (top-level message target with the original :shortid).
//   - Reuse the exact target from the inbound message when replying.
//   - Fail-closed: any error in claim, send, or update leaves the task
//     claimable for another runner rather than claiming it ourselves.
//
// Per raft.md etiquette: ack → progress → summary. We keep the ack compact
// and skip progress unless there's concrete content to report (no idle
// narration). Status follows `todo → in_progress → in_review → done`.

import type { RunnerConfig } from "./config.ts";
import type { Eve } from "./eve.ts";
import type { Raft, RaftMessage, RaftTask, RaftHistoryMessage } from "./raft.ts";
import { RaftCallError } from "./raft.ts";
import type { MessageStore, SeenStatus } from "./store.ts";
import type { OutboundQueue } from "./queue.ts";
import { draftProgress, draftSummary } from "./messages.ts";
import { getLogger, errFields } from "./logger.ts";

export class Bridge {
  private running = false;
  private readonly log = getLogger().child({ component: "bridge" });
  /**
   * Message ids we've already processed. `raft message check` can return the
   * same id on every poll — we can't ack from this side: the `/receive-ack`
   * endpoint requires a machine API key (`sk_machine_*`) and the runner
   * profile only has an agent API key (`sk_agent_*`). So we dedupe
   * client-side and treat any id we've already seen as handled.
   *
   * Two reasons the same id shows up:
   *
   *   1. Our own replies (ack, summary) come back to the inbox on the next
   *      poll. Outgoing bodies don't start with `@<handle>:`, so the parser
   *      can't identify them as our own. We track ids returned by
   *      `messageSend` and skip them.
   *   2. Third-party messages keep being re-delivered because the CLI in
   *      `self-hosted-runner` mode reads the inbox without acking. The CLI's
   *      local `consumed-seqs.json` is only consulted on the SEND path
   *      (`seenUpToSeq`), not on receive, so we can't reuse it for dedup.
   *
   * The dedup set lives in libsql (via MessageStore) so it survives
   * restarts; an in-memory Set hydrated from the store on `start()` keeps
   * per-message checks O(1).
   */
  private readonly seenMessageIds = new Set<string>();

  /**
   * Max rows drained from the outbound queue per poll tick. Bounds work per
   * tick so a large backlog doesn't starve inbound message handling.
   */
  private static readonly MAX_DRAIN_PER_TICK = 5;
  /** Send attempts before a queued message is marked terminal 'failed'. */
  private static readonly MAX_SEND_ATTEMPTS = 5;

  constructor(
    private readonly cfg: RunnerConfig,
    private readonly raft: Raft,
    private readonly eve: Eve,
    private readonly store: MessageStore,
    private readonly queue: OutboundQueue,
  ) {}

  private async markSeen(id: string, status: SeenStatus): Promise<void> {
    if (this.seenMessageIds.has(id)) return;
    this.seenMessageIds.add(id);
    try {
      await this.store.markSeen(id, status);
    } catch (err) {
      // Don't drop the id from memory on a write failure — without the
      // in-memory record the next poll in this same process would still
      // see it as fresh and we'd write through again. A subsequent write
      // retry (also idempotent thanks to INSERT OR IGNORE) is fine; what
      // we want to avoid is the id being skipped by the in-memory set
      // while never reaching durable storage.
      this.log.error("failed to persist seen message", {
        msgId: id,
        status,
        error: errFields(err),
      });
    }
  }

  /**
   * Start the poll loop. Returns when `stop()` is called. Each tick is wrapped
   * in try/catch so one bad task doesn't kill the daemon.
   */
  async start(): Promise<void> {
    this.running = true;
    // Hydrate the in-memory dedup set from durable storage before the first
    // poll. If the store is empty (fresh DB, or first run since enabling
    // this) we start with an empty set and absorb the redelivered ids
    // through `markSeen` as before — no special-case handling needed.
    const stored = await this.store.loadSeenIds();
    for (const id of stored) this.seenMessageIds.add(id);
    this.log.info("poll loop starting", {
      raftProfile: this.cfg.raftProfile,
      eveHost: this.cfg.eveHost,
      pollIntervalMs: this.cfg.pollIntervalMs,
      hydratedFromStore: this.seenMessageIds.size,
    });

    while (this.running) {
      try {
        await this.tick();
      } catch (err) {
        // Most ticks will fail in the same way until the user fixes the
        // underlying issue (missing raft binary, wrong raft server, etc.).
        // The logger's dedupe collapses repeat occurrences into one line.
        this.log.error("tick failed", { error: errFields(err) });
      }
      if (!this.running) break;
      await sleep(this.cfg.pollIntervalMs);
    }
  }

  stop(): void {
    this.running = false;
  }

  /**
   * One poll iteration. Discover new messages, then for each unclaimed task
   * that names us (or any unclaimed task if no @mention is present, for v1
   * simplicity), claim it and run the eve turn.
   */
  private async tick(): Promise<void> {
    // Drain the outbound queue before polling raft. Anything enqueued by
    // eve tools in prior turns (or by a previous runner instance) gets a
    // chance to land before we pull new work — keeps the queue's steady-
    // state lag bounded by `pollIntervalMs` rather than `(2 × interval)`.
    await this.drainQueue();

    const messages = await this.raft.messageCheck();
    if (messages.length === 0) return;

    // The raft CLI in self-hosted-runner mode doesn't ack the server, so the
    // inbox keeps redelivering the same ids. Filter them out before logging
    // so the operator only sees work that actually needs doing. The set also
    // captures our own ack/summary ids, so those don't log either.
    const fresh = messages.filter((m) => !this.seenMessageIds.has(m.id));
    if (fresh.length === 0) return;

    this.log.info("messages received", {
      count: fresh.length,
      // Surface the redelivery count so the loop is still observable when
      // debugging, just not on the steady-state info line.
      repeated: messages.length - fresh.length,
    });

    for (const msg of fresh) {
      try {
        await this.handleMessage(msg);
      } catch (err) {
        this.log.error("failed to handle message", {
          msgId: msg.id,
          author: msg.author,
          target: msg.target,
          error: errFields(err),
        });
      }
    }
  }

  /**
   * Pull up to {@link MAX_DRAIN_PER_TICK} due rows from the outbound queue
   * and post each one to raft. Transient failures bump `attempts`; after
   * {@link MAX_SEND_ATTEMPTS} the row is marked terminal 'failed' so it
   * stops competing for drain slots.
   *
   * Each row's send is wrapped in its own try/catch so one bad target
   * (e.g. a typo from a tool) doesn't stall the rest of the batch.
   */
  private async drainQueue(): Promise<void> {
    const due = await this.queue.claimReady(Bridge.MAX_DRAIN_PER_TICK);
    if (due.length === 0) return;
    this.log.info("queue draining", { count: due.length });

    for (const m of due) {
      try {
        await this.raft.messageSend(m.target, m.body);
        await this.queue.markSent(m.id);
        this.log.info("queue sent", {
          id: m.id,
          target: m.target,
          attempts: m.attempts,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        const nextAttempts = m.attempts + 1;
        if (nextAttempts >= Bridge.MAX_SEND_ATTEMPTS) {
          await this.queue.markFailed(m.id, error);
          this.log.error("queue send failed permanently", {
            id: m.id,
            target: m.target,
            attempts: nextAttempts,
            error,
          });
        } else {
          await this.queue.recordFailure(m.id, error);
          this.log.warn("queue send failed; will retry", {
            id: m.id,
            target: m.target,
            attempts: nextAttempts,
            error,
          });
        }
      }
    }
  }

  private async handleMessage(msg: RaftMessage): Promise<void> {
    // Skip messages we've already processed. The CLI may re-deliver the same
    // id across polls (no server-side ack in self-hosted-runner mode), and our
    // own replies come back to the inbox on the next check.
    if (this.seenMessageIds.has(msg.id)) {
      this.log.debug("skipping already-processed message", { msgId: msg.id });
      return;
    }
    // Skip our own echoes and non-actionable messages. Per raft.md etiquette,
    // only join ongoing conversations when explicitly addressed.
    if (msg.author === this.cfg.raftHandle) {
      await this.markSeen(msg.id, "skipped");
      return;
    }
    if (!this.isAddressedToUs(msg)) {
      this.log.debug("skipping message not addressed to us", {
        msgId: msg.id,
        author: msg.author,
        isTask: msg.isTask,
      });
      await this.markSeen(msg.id, "skipped");
      return;
    }

    const stripped = stripThreadSuffix(msg.target);
    // For DM tasks, flip the handle so the claim target is on our side of the
    // conversation (we can't claim in `dm:@<us>` — that's a self-DM).
    const channel = msg.target.startsWith("dm:")
      ? flipDMHandle(stripped, msg.author)
      : stripped;
    this.log.info("handling message", {
      msgId: msg.id,
      author: msg.author,
      channel,
      isTask: msg.isTask,
      taskNumber: msg.taskNumber,
      body: truncate(msg.body, 500),
    });

    // Per raft.md §"Tasks": "If you're only answering a question or having a
    // conversation, no claim needed." We claim only when the inbound message
    // is a task (i.e., has a `[task #N status=...]` suffix); plain DMs and
    // conversation turns flow straight through to the eve turn.
    if (msg.isTask) {
      await this.claim(channel, msg);
    }
    await this.runTurn(channel, msg);
    await this.markSeen(msg.id, "processed");
  }

  private async claim(channel: string, msg: RaftMessage): Promise<void> {
    try {
      if (msg.isTask && msg.taskNumber !== undefined) {
        await this.raft.taskClaim(channel, { numbers: [msg.taskNumber] });
      } else {
        await this.raft.taskClaim(channel, { messageIds: [msg.id] });
      }
      this.log.info("task claimed", {
        channel,
        msgId: msg.id,
        taskNumber: msg.taskNumber,
      });
    } catch (err) {
      if (
        err instanceof RaftCallError &&
        err.code.startsWith("TASK_ALREADY_")
      ) {
        // Someone else got there first (raft.md §"Tasks" step 2). Move on.
        this.log.info("task already claimed by another agent; skipping", {
          channel,
          msgId: msg.id,
        });
        return;
      }
      throw err;
    }
  }

  /**
   * Run one eve turn for the claimed task: ack-react → call eve → post summary
   * → mark in_review. We do NOT mark done — that requires human approval
   * per raft.md's `in_review → done` gate.
   */
  private async runTurn(channel: string, msg: RaftMessage): Promise<void> {
    // 1. Acknowledge with a 👀 reaction on the inbound message. Reactions are
    //    cheap (no new message posted to the channel), align with raft.md's
    //    "use sparingly for acknowledgement" guidance, and skip the noise of
    //    a "Acknowledged." post on every poll.
    await this.raft.messageReact(msg.id, "👀");
    this.log.info("ack reacted", { msgId: msg.id, emoji: "👀" });

    // 2. Fetch recent channel history so the eve agent has conversational
    //    context (what was said before this message). The fetch is best-
    //    effort — if raft rejects or returns nothing, we fall through to an
    //    empty context rather than failing the turn.
    let raftRecentMessages: RaftHistoryMessage[] = [];
    if (this.cfg.channelHistoryLimit > 0) {
      const fetchStart = Date.now();
      try {
        raftRecentMessages = await this.raft.messageRead(channel, {
          limit: this.cfg.channelHistoryLimit,
        });
        this.log.info("channel history fetched", {
          msgId: msg.id,
          channel,
          count: raftRecentMessages.length,
          durationMs: Date.now() - fetchStart,
        });
      } catch (err) {
        this.log.warn("channel history fetch failed; continuing without it", {
          msgId: msg.id,
          channel,
          error: errFields(err),
        });
      }
    }

    // 3. Drive the eve turn. clientContext carries ephemeral attribution
    //    metadata per the eve client docs (not persisted to durable history).
    //    `raft_target` is the thread target the reply should land in — the
    //    `enqueue_raft_message` tool reads it so a tool call doesn't need to
    //    recompute the DM/thread flip logic. `raft_recent_messages` gives the
    //    agent conversational context for the current turn.
    const eveStart = Date.now();
    this.log.info("eve turn starting", { msgId: msg.id, channel });
    const eveResult = await this.eve.send(msg.body, {
      raft_channel: channel,
      raft_message_id: msg.id,
      raft_author: msg.author,
      raft_target: threadTarget(msg),
      raft_requested_at: new Date().toISOString(),
      raft_recent_messages: raftRecentMessages,
    });
    this.log.info("eve turn finished", {
      msgId: msg.id,
      sessionId: eveResult.sessionId,
      status: eveResult.status,
      modelId: eveResult.modelId,
      durationMs: Date.now() - eveStart,
      chars: eveResult.text.length,
    });

    // 3. Optional progress note only if the eve turn took long enough that
    // a one-line "still working" beat is worth it. For v1 we always skip
    // this — the summary is enough — but the helper is wired up.
    if (false as boolean) {
      const progress = draftProgress("eve turn finished, drafting summary…");
      await this.raft.messageSend(threadTarget(msg), progress.body);
    }

    // 4. Final summary.
    const summary = draftSummary({
      eveText: eveResult.text,
      status: eveResult.status,
      sessionId: eveResult.sessionId,
      modelId: eveResult.modelId,
      maxChars: this.cfg.summaryMaxChars,
    });
    const summaryTarget = threadTarget(msg);
    const summarySent = await this.raft.messageSend(
      summaryTarget,
      summary.body,
    );
    await this.markSeen(summarySent.messageId, "skipped");
    this.log.info("summary posted", {
      thread: summaryTarget,
      raftMsgId: summarySent.messageId,
    });

    // 5. Flip to in_review so a human can approve → done.
    if (msg.isTask && msg.taskNumber !== undefined) {
      await this.raft.taskUpdate(channel, msg.taskNumber, "in_review");
      this.log.info("task marked in_review", {
        channel,
        taskNumber: msg.taskNumber,
      });
    } else {
      this.log.info("non-task message handled; no status flip", {
        msgId: msg.id,
      });
    }
  }

  /**
   * True if the message is addressed to this runner. Per raft.md §"Conversation
   * etiquette", a DM in the runner's inbox is addressed by definition (you can
   * only receive messages from a DM, not eavesdrop). We also accept explicit
   * @mentions of our handle and any task suffix.
   *
   * Caveat: `target=dm:@<peer>` names the *other* participant, not us. The fact
   * that the message appeared in our `raft message check` output is what makes
   * it ours — we accept any DM that we were able to drain.
   */
  private isAddressedToUs(msg: RaftMessage): boolean {
    if (msg.isTask) return true;
    if (msg.target.startsWith("dm:")) return true;
    if (msg.body.includes(`@${this.cfg.raftHandle}`)) return true;
    return false;
  }
}

// --- helpers -----------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Trim a string for logging. Long messages would otherwise dominate the log
 * line; keeping a preview is enough to see what the runner is responding to.
 */
function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…(truncated)` : s;
}

/**
 * Strip the `:shortid` thread suffix from a target so we can pass a channel
 * target to commands that don't accept thread targets (task claim, task list).
 */
export function stripThreadSuffix(target: string): string {
  const idx = target.lastIndexOf(":");
  if (idx === -1) return target;
  // Only strip if it looks like a shortid (hex). Don't strip `:port`.
  const suffix = target.slice(idx + 1);
  return /^[0-9a-f]+$/i.test(suffix) ? target.slice(0, idx) : target;
}

/**
 * Build the thread target for posting replies. If the inbound message is in a
 * thread (target contains `:shortid`), reply to that thread; otherwise reply
 * at top level with a thread anchored on the inbound message id.
 *
 * DM-asymmetry caveat: the inbound `target` on a DM is `dm:@<recipient>` —
 * i.e., the channel name from the *other* party's perspective. We (the
 * recipient) cannot reuse that target, because it would be a self-DM. Instead
 * we flip the handle to the inbound author so the reply lands in the same
 * conversation from our side.
 *
 * Examples (assuming we are @runner):
 *   inbound from @tester: target=`dm:@runner` author=`@tester`
 *     → reply target = `dm:@tester` (top-level) or `dm:@tester:<shortid>` (in-thread)
 *   inbound from @tester in-thread: target=`dm:@runner:<shortid>` author=`@tester`
 *     → reply target = `dm:@tester:<shortid>` (reuse the same thread)
 *   inbound from #general: target=`#general` author=`@nandi`
 *     → reply target = `#general` or `#general:<shortid>`
 */
export function threadTarget(msg: RaftMessage): string {
  const isDM = msg.target.startsWith("dm:");
  const stripped = stripThreadSuffix(msg.target);
  // Flip the handle for DMs so we don't try to DM ourselves.
  const base = isDM ? flipDMHandle(stripped, msg.author) : stripped;
  const isInThread = msg.target.includes(":");
  return isInThread ? msg.target : `${base}:${msg.id.slice(0, 8)}`;
}

/**
 * Given a DM target like `dm:@runner` and the inbound author's handle like
 * `@tester`, return the DM target the recipient should use to reply:
 * `dm:@tester`. Returns the input unchanged when the target isn't a DM or the
 * author isn't a handle we can flip to.
 */
function flipDMHandle(target: string, author: string): string {
  if (!target.startsWith("dm:")) return target;
  const handle = author.startsWith("@") ? author.slice(1) : author;
  if (!handle) return target;
  return `dm:@${handle}`;
}

// Re-export so consumers can build typed test fixtures.
export type { RaftMessage, RaftTask };
