// Thin wrapper around the `raft` CLI.
//
// The runner uses 6 commands from the 30 listed in raft.md:
//   - raft message check           (non-blocking poll for new messages)
//   - raft task list               (survey the board for claimable work)
//   - raft task claim              (claim-before-work)
//   - raft task update             (status transitions: in_progress, in_review, done)
//   - raft message send            (post progress + summary)
//   - raft message react           (add the runner's 👀 ack on the inbound msg)
//
// `raft message check` calls the CLI as usual, but the runner keeps its own
// `seenMessageIds` set (see bridge.ts) because in `self-hosted-runner` mode
// the CLI does NOT call `/receive-ack`, so the server keeps redelivering the
// same ids indefinitely. A direct ack from the runner is not possible: the
// `/receive-ack` endpoint requires a machine API key (`sk_machine_*`); the
// runner profile only has an agent API key (`sk_agent_*`).
//
// Per raft.md, every call uses --profile <slug> so the CLI resolves the
// right credential. Per raft.md §"Sending messages", message bodies are
// piped on stdin via heredoc; this wrapper handles the pipe.

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { RunnerConfig } from "./config.ts";

/**
 * Debug flag for the raw `raft message check` stdout. Set to true from a
 * diagnostic harness; leave false in production. Picked up via env so it
 * can be turned on without rebuilding.
 */
const MESSAGE_CHECK_DEBUG = process.env.RUNNER_DEBUG_MESSAGE_CHECK === "1";

export type RaftError = {
  summary: string;
  code: string;
  nextAction?: string;
};

export class RaftCallError extends Error {
  readonly code: string;
  readonly nextAction?: string;
  constructor(
    err: RaftError,
    public readonly command: string,
  ) {
    super(
      `raft ${err.code}: ${err.summary}${err.nextAction ? ` (next: ${err.nextAction})` : ""}`,
    );
    this.code = err.code;
    this.nextAction = err.nextAction;
  }
}

export type RaftTask = {
  /** Task number on the channel board, e.g. 3. */
  number: number;
  /** Stable message id for the task-message. */
  messageId: string;
  /** Channel target the task lives in, e.g. "#general" or "dm:@alice". */
  channel: string;
  title: string;
  status: "todo" | "in_progress" | "in_review" | "done";
  assignee?: string;
};

export type RaftMessage = {
  /** Raw message id from the receipt header. */
  id: string;
  /** Target the message came from — reuse this exactly when replying (raft.md). */
  target: string;
  author: string;
  body: string;
  /** True if the message has a task suffix like `[task #3 status=todo]`. */
  isTask: boolean;
  taskNumber?: number;
  /** Message type from the receipt header (e.g. "human", "agent", "system"). */
  messageType?: string;
};

export class Raft {
  private readonly activeChildren = new Set<ChildProcess>();

  constructor(private readonly cfg: RunnerConfig) {}

  /**
   * Kill every in-flight raft subprocess. Used on SIGINT/SIGTERM so the
   * CLI children don't outlive the runner and keep the poll loop blocked.
   */
  killActive(signal: NodeJS.Signals = "SIGTERM"): void {
    for (const child of this.activeChildren) {
      try {
        child.kill(signal);
      } catch {
        // Child may have just exited; ignore.
      }
    }
  }

  /**
   * Run a raft command and return { stdout, stderr, exitCode }. Throws
   * RaftCallError if the CLI emits a canonical labeled error on stderr.
   */
  private async exec(
    args: ReadonlyArray<string>,
    stdin?: string,
  ): Promise<{ stdout: string; stderr: string }> {
    // Per raft.md, the server URL is bound to the profile during
    // `raft agent login`, not passed per-call. Only `--profile <slug>` is
    // added to every invocation.
    const fullArgs = ["--profile", this.cfg.raftProfile, ...args];
    return new Promise((resolve, reject) => {
      const child = spawn(this.cfg.raftBin, fullArgs, {
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.activeChildren.add(child);
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
      child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
      child.on("error", (err) => {
        this.activeChildren.delete(child);
        reject(err);
      });
      child.on("close", (code) => {
        this.activeChildren.delete(child);
        const stdout = Buffer.concat(stdoutChunks).toString("utf8");
        const stderr = Buffer.concat(stderrChunks).toString("utf8");
        if (code !== 0) {
          const parsed = parseRaftError(stderr) ?? {
            summary: stderr.trim() || `exit ${code}`,
            code: "RAFT_EXIT_NONZERO",
          };
          reject(new RaftCallError(parsed, fullArgs.join(" ")));
          return;
        }
        resolve({ stdout, stderr });
      });
      if (stdin !== undefined) {
        child.stdin.end(stdin);
      } else {
        child.stdin.end();
      }
    });
  }

  /** Non-blocking poll for new messages. Returns up to N most recent. */
  async messageCheck(): Promise<RaftMessage[]> {
    const { stdout } = await this.exec(["message", "check"]);
    // Debug log of raw stdout so we can verify the parser is reading the
    // right format. Gated behind a module-level flag so it's free in prod.
    if (MESSAGE_CHECK_DEBUG && stdout.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`[raft.messageCheck raw stdout]\n${stdout}`);
    }
    return stdout.length > 0 ? parseMessageCheck(stdout) : [];
  }

  /** List tasks on a channel's board. */
  async taskList(channel: string): Promise<RaftTask[]> {
    const { stdout } = await this.exec(["task", "list", "--channel", channel]);
    return parseTaskList(stdout);
  }

  /** Claim one or more tasks by repeatable --number / --message-id flags. */
  async taskClaim(
    channel: string,
    opts: { numbers?: number[]; messageIds?: string[] },
  ): Promise<void> {
    const args = ["task", "claim", "--channel", channel];
    for (const n of opts.numbers ?? []) args.push("--number", String(n));
    for (const id of opts.messageIds ?? []) args.push("--message-id", id);
    await this.exec(args);
  }

  /** Update task status. Allowed transitions per raft.md: todo → in_progress → in_review → done. */
  async taskUpdate(
    channel: string,
    number: number,
    status: RaftTask["status"],
  ): Promise<void> {
    await this.exec([
      "task",
      "update",
      "--channel",
      channel,
      "--number",
      String(number),
      "--status",
      status,
    ]);
  }

  /**
   * Send a message. `target` must be reused exactly from the inbound message
   * header (raft.md §"Sending messages"). The body is piped on stdin so quotes,
   * backticks, code blocks, and newlines round-trip verbatim.
   */
  async messageSend(
    target: string,
    body: string,
  ): Promise<{ messageId: string }> {
    const { stdout } = await this.exec(
      ["message", "send", "--target", target],
      body,
    );
    const id = parseSentMessageId(stdout);
    return { messageId: id };
  }

  /**
   * Add or remove a reaction on an existing message. The CLI's agent guidance
   * (see `raft message react --help`) tells us to use reactions only as a
   * clear acknowledgement — the runner sticks to 👀 for inbound messages and
   * doesn't fan out celebratory emoji on every task completion.
   */
  async messageReact(
    messageId: string,
    emoji: string,
    opts: { remove?: boolean } = {},
  ): Promise<void> {
    const args = [
      "message",
      "react",
      "--message-id",
      messageId,
      "--emoji",
      emoji,
    ];
    if (opts.remove) args.push("--remove");
    await this.exec(args);
  }
}

// --- parsers -----------------------------------------------------------

/**
 * Parse the canonical labeled error format from raft stderr:
 *   Error: <summary>
 *   Code: <code>
 *   Next action: <hint>     (optional)
 */
export function parseRaftError(stderr: string): RaftError | null {
  const lines = stderr.split(/\r?\n/);
  let summary: string | undefined;
  let code: string | undefined;
  let nextAction: string | undefined;
  for (const line of lines) {
    const m = line.match(/^Error:\s*(.*)$/);
    if (m) summary = m[1];
    const c = line.match(/^Code:\s*(.*)$/);
    if (c) code = c[1];
    const n = line.match(/^Next action:\s*(.*)$/);
    if (n) nextAction = n[1];
  }
  if (!summary && !code) return null;
  return { summary: summary ?? "", code: code ?? "RAFT_UNKNOWN", nextAction };
}

/**
 * Parse the human-readable canonical text `raft message check` emits. The CLI
 * prints messages in the format users see in their UI; for v1 we extract a
 * minimal subset (target, author, body, task suffix). Newlines and
 * backticks in the body are preserved.
 *
 * Observed format (one line per message):
 *   [target=<t> msg=<id> time=<iso> type=<human|agent>] <body...>
 *
 * Bodies from humans begin with an `@author:` prefix, e.g. `@nandi: hey`.
 * We strip that prefix to recover the author and the actual body text. A
 * footer line like "No more new messages." is ignored.
 */
export function parseMessageCheck(stdout: string): RaftMessage[] {
  const out: RaftMessage[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(No more new messages|No new messages)\.?\s*$/i.test(line)) continue;

    const headerMatch = line.match(/^\[([^\]]+)\]\s*(.*)$/s);
    if (!headerMatch) continue;
    const header = headerMatch[1];
    let body = headerMatch[2];

    const target = (header.match(/target=([^\s]+)/)?.[1] ?? "").trim();
    const id = (header.match(/msg=([^\s]+)/)?.[1] ?? "").trim();
    const messageType = (header.match(/type=(\w+)/)?.[1] ?? "").trim();
    if (!target || !id) continue;

    // Author: extract from the `@author:` body prefix.
    //   Human:   `@nandi: hey`
    //   Agent:   `@tester — general hermes test agent: hey`
    // We capture up to the first colon and use the leading `@handle` as the
    // author. Falls back to empty string for system-generated lines.
    let author = "";
    const authorPrefix = body.match(/^@([A-Za-z0-9_\-]+)\b[^:]*:\s*/);
    if (authorPrefix) {
      author = `@${authorPrefix[1]}`;
      body = body.slice(authorPrefix[0].length);
    }

    const taskSuffix = body.match(/\[task\s+#(\d+)\s+status=(\w+)\]/);
    let taskNumber: number | undefined;
    let isTask = false;
    if (taskSuffix) {
      isTask = true;
      taskNumber = Number.parseInt(taskSuffix[1], 10);
      body = body.replace(taskSuffix[0], "").trim();
    }

    out.push({ id, target, author, body, isTask, taskNumber, messageType });
  }
  return out;
}

/**
 * Parse `raft task list` output. v1 expects lines like:
 *   #3 [todo] @alice "Fix the login bug"
 * If the CLI returns richer structured data later, this parser can be
 * swapped without changing call sites.
 */
export function parseTaskList(stdout: string): RaftTask[] {
  const out: RaftTask[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(
      /^#(\d+)\s+\[(\w+)\](?:\s+(@\S+))?\s+["“](.+?)["”]\s*$/,
    );
    if (!m) continue;
    const status = m[2];
    if (!isTaskStatus(status)) continue;
    out.push({
      number: Number.parseInt(m[1], 10),
      messageId: "", // populated by re-reading if needed
      channel: "", // populated by caller
      title: m[4],
      status,
      assignee: m[3],
    });
  }
  return out;
}

function isTaskStatus(s: string): s is RaftTask["status"] {
  return (
    s === "todo" || s === "in_progress" || s === "in_review" || s === "done"
  );
}

/**
 * Parse the message id echoed by `raft message send` on success. The CLI
 * includes a `msg=<id>` token in its reply; if the format differs the caller
 * falls back to an empty id (downstream code treats it as opaque).
 */
export function parseSentMessageId(stdout: string): string {
  return stdout.match(/msg=([^\s]+)/)?.[1] ?? "";
}
