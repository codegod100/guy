// Loads and validates the env vars the runner needs to operate.
// Reads from process.env directly — the runner is a standalone Node process,
// not part of the Next.js bundle, so we don't go through any app config layer.

export type RunnerConfig = {
  /** Raft server URL, passed as `raft --server` (and baked into profile login). */
  raftServer: string;
  /** Profile slug the runner authenticates as. Passed as `--profile <slug>`. */
  raftProfile: string;
  /** Stable Raft @handle used for ack/progress posts. Defaults to `runner`. */
  raftHandle: string;
  /** Base URL of the deployed eve agent (e.g. https://guy.vercel.app). No trailing slash. */
  eveHost: string;
  /** Bearer token for the eve channel. Optional for loopback (`localDev()` accepts requests without an Authorization header); required for any non-loopback host behind a custom auth chain. */
  eveAuthBearer?: string;
  /** Poll interval in milliseconds. */
  pollIntervalMs: number;
  /** Per-task turn timeout in milliseconds. */
  turnTimeoutMs: number;
  /** Raft CLI binary name. Defaults to "raft"; "slock" remains a legacy alias. */
  raftBin: string;
  /**
   * libsql connection URL for the durable seen-messages store. Falls back
   * to `TURSO_DATABASE_URL` so the runner can share the project's existing
   * Turso database. A `file:` URL is also supported for local SQLite.
   */
  dbUrl: string;
  /** Optional libsql auth token. Falls back to `TURSO_AUTH_TOKEN`. */
  dbAuthToken?: string;
  /**
   * How many recent channel messages to fetch and pass to the eve agent as
   * context for each turn. 0 disables the fetch entirely.
   */
  channelHistoryLimit: number;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `runner: missing required env var ${name}. ` +
        `See guy/runner/README.md for the full list.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function parsePositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `runner: env var ${name} must be a positive integer, got "${raw}"`,
    );
  }
  return n;
}

/**
 * Resolve a runner-prefixed env var, falling back to a shared project
 * variable. This lets the runner override the project's Turso database
 * (e.g. point at a separate runner-only instance) without forking config.
 */
function pickEnv(runnerName: string, fallbackName: string): string {
  return (
    process.env[runnerName]?.trim() ||
    process.env[fallbackName]?.trim() ||
    ""
  );
}

export function loadConfig(): RunnerConfig {
  const eveHost = required("EVE_HOST").replace(/\/+$/, "");
  const dbUrl = pickEnv("RUNNER_DB_URL", "TURSO_DATABASE_URL");
  if (!dbUrl) {
    throw new Error(
      "runner: missing required env var RUNNER_DB_URL (or TURSO_DATABASE_URL). " +
        "Set it to a libsql URL (e.g. libsql://... or file:./.workflow-data/runner.db). " +
        "See guy/runner/README.md for details.",
    );
  }
  return {
    raftServer: required("RAFT_SERVER"),
    raftProfile: required("RAFT_PROFILE"),
    raftHandle: optional("RUNNER_AGENT_HANDLE", "runner"),
    eveHost,
    eveAuthBearer: optional("EVE_AUTH_BEARER", ""),
    pollIntervalMs: parsePositiveInt("RUNNER_POLL_INTERVAL_MS", 5_000),
    turnTimeoutMs: parsePositiveInt("RUNNER_TURN_TIMEOUT_MS", 5 * 60_000),
    raftBin: optional("RAFT_BIN", "raft"),
    dbUrl,
    dbAuthToken: pickEnv("RUNNER_DB_AUTH_TOKEN", "TURSO_AUTH_TOKEN") || undefined,
    channelHistoryLimit: parsePositiveInt("RUNNER_CHANNEL_HISTORY_LIMIT", 10),
  };
}
