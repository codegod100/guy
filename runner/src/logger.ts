// Tiny structured logger for the runner. No external dependency.
//
// Defaults:
//   - LOG_LEVEL=info (debug | info | warn | error)
//   - LOG_FORMAT=pretty (pretty | json)
//   - color is auto-enabled when stdout is a TTY; force via LOG_COLOR=1
//
// Error deduplication: identical errors (same message + error name + error
// message) within a 30-second window are collapsed. The first occurrence logs
// normally; subsequent occurrences bump an internal counter and stay silent
// until the window expires, at which point a single "repeated N times" line
// is emitted and the counter resets. This stops the "raft binary not found"
// error from spamming once every poll interval.

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFormat = "pretty" | "json";

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m", // gray
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const ERROR_DEDUPE_WINDOW_MS = 30_000;

export type LoggerOptions = {
  level?: LogLevel;
  format?: LogFormat;
  color?: boolean;
};

type ErrorFields = { name?: string; message?: string };

/**
 * Module-level singleton used by everything that doesn't bind its own fields.
 * Created lazily on first access so env reads happen at startup, not at
 * module-import time (which would happen before dotenv loaded).
 */
let _default: Logger | undefined;

export function getLogger(opts: LoggerOptions = {}): Logger {
  if (!_default) {
    _default = new Logger(opts);
  }
  return _default;
}

export class Logger {
  private readonly threshold: number;
  private readonly format: LogFormat;
  private readonly color: boolean;
  private readonly recentErrors = new Map<string, { count: number; firstLogged: number; lastLogged: number }>();

  constructor(opts: LoggerOptions = {}) {
    this.threshold = LEVEL_RANK[opts.level ?? readLevel()];
    this.format = opts.format ?? readFormat();
    this.color = opts.color ?? readColor();
  }

  child(fields: Record<string, unknown>): BoundLogger {
    return new BoundLogger(this, fields);
  }

  debug(msg: string, fields?: Record<string, unknown>): void {
    this.emit("debug", msg, fields);
  }
  info(msg: string, fields?: Record<string, unknown>): void {
    this.emit("info", msg, fields);
  }
  warn(msg: string, fields?: Record<string, unknown>): void {
    this.emit("warn", msg, fields);
  }
  error(msg: string, fields?: Record<string, unknown>): void {
    this.emit("error", msg, fields);
  }

  private emit(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    if (LEVEL_RANK[level] < this.threshold) return;

    // Error-level deduplication. Errors carry an `error: { name, message }`
    // shape (see main.ts / bridge.ts callers). Signature on message + those
    // two fields so different errors still log independently.
    if (level === "error" && fields) {
      const sig = errorSignature(msg, fields.error as ErrorFields | undefined);
      const now = Date.now();
      const existing = this.recentErrors.get(sig);

      if (existing && now - existing.lastLogged < ERROR_DEDUPE_WINDOW_MS) {
        existing.count++;
        existing.lastLogged = now;
        return;
      }

      if (existing) {
        // Window expired; flush the previous bucket as a summary, then let
        // the new error log normally.
        const summary: Record<string, unknown> = {
          ...fields,
          dedup_count: existing.count,
          dedup_window_ms: now - existing.firstLogged,
        };
        const summaryMsg = `${msg} (repeated ${existing.count} times)`;
        this.write(level, summaryMsg, summary);
        this.recentErrors.delete(sig);
      }

      this.recentErrors.set(sig, { count: 1, firstLogged: now, lastLogged: now });
    }

    this.write(level, msg, fields);
  }

  private write(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    const ts = new Date().toISOString();
    const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;

    if (this.format === "json") {
      stream.write(JSON.stringify({ ts, level, msg, ...fields }) + "\n");
      return;
    }

    stream.write(formatPretty(ts, level, msg, fields, this.color) + "\n");
  }
}

export class BoundLogger {
  constructor(
    private readonly parent: Logger,
    private readonly fields: Record<string, unknown>,
  ) {}

  debug(msg: string, extra?: Record<string, unknown>): void {
    this.parent.debug(msg, merge(this.fields, extra));
  }
  info(msg: string, extra?: Record<string, unknown>): void {
    this.parent.info(msg, merge(this.fields, extra));
  }
  warn(msg: string, extra?: Record<string, unknown>): void {
    this.parent.warn(msg, merge(this.fields, extra));
  }
  error(msg: string, extra?: Record<string, unknown>): void {
    this.parent.error(msg, merge(this.fields, extra));
  }
}

function merge(base: Record<string, unknown>, extra?: Record<string, unknown>): Record<string, unknown> {
  return extra ? { ...base, ...extra } : base;
}

function errorSignature(msg: string, err: ErrorFields | undefined): string {
  return `${msg}|${err?.name ?? ""}|${err?.message ?? ""}`;
}

function formatPretty(
  ts: string,
  level: LogLevel,
  msg: string,
  fields: Record<string, unknown> | undefined,
  color: boolean,
): string {
  const time = color ? `${DIM}${ts}${RESET}` : ts;
  const lvl = color
    ? `${LEVEL_COLORS[level]}${level.toUpperCase().padEnd(5)}${RESET}`
    : level.toUpperCase().padEnd(5);

  let out = `${time} ${lvl} ${msg}`;
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      out += `\n  ${color ? DIM : ""}${k}=${color ? RESET : ""}${formatValue(v)}`;
    }
  }
  return out;
}

function formatValue(v: unknown): string {
  // JSON.stringify strings so embedded newlines, quotes, and unicode round-trip
  // cleanly across one-property-per-line output.
  if (typeof v === "string") return JSON.stringify(v);
  if (v instanceof Error) return JSON.stringify({ name: v.name, message: v.message });
  return JSON.stringify(v);
}

function readLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return "info";
}

function readFormat(): LogFormat {
  return process.env.LOG_FORMAT === "json" ? "json" : "pretty";
}

function readColor(): boolean {
  if (process.env.LOG_COLOR === "1") return true;
  if (process.env.LOG_COLOR === "0") return false;
  return Boolean(process.stdout.isTTY);
}

/**
 * Convenience: format an Error into the `{ name, message, stack? }` shape
 * callers pass to logger.error. Stack is omitted by default to keep logs
 * compact; pass `{ withStack: true }` for full traces.
 */
export function errFields(err: unknown, withStack = false): { name: string; message: string; stack?: string } {
  if (err instanceof Error) {
    return withStack
      ? { name: err.name, message: err.message, stack: err.stack }
      : { name: err.name, message: err.message };
  }
  return { name: "NonError", message: String(err) };
}
