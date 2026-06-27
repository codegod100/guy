// Credential redaction, per raft.md §"Credential hygiene".
//
// Raft posts go to chat surfaces that may be public. Agent tokens, machine
// keys, JWTs, and .env contents must never appear in those posts. This module
// rewrites credential-shaped strings before any post leaves the runner.
//
// Only redact when posting to public surfaces. DMs and private channels are
// allowed for authorized secret handoff per raft.md, but the runner does not
// post to either of those in v1, so all redactions are unconditional.

const REDACTION_PATTERNS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  // Current agent token shape.
  { pattern: /sk_agent_[A-Za-z0-9_\-]+/g, replacement: "sk_agent_<redacted>" },
  // Legacy machine API key shape.
  { pattern: /sk_machine_[A-Za-z0-9_\-]+/g, replacement: "sk_machine_<redacted>" },
  // Generic bearer / JWT-ish tokens (eyJ prefix) — best-effort, may false-positive
  // on base64 chunks that legitimately start with eyJ. Callers can opt out per-text
  // via `redactForPublic(..., { jwts: false })` if they hit false positives.
  { pattern: /eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, replacement: "<redacted-jwt>" },
];

export type RedactOptions = {
  /** Default true. Set false to skip the JWT-shaped matcher. */
  jwts?: boolean;
};

/**
 * Returns `text` with credential-shaped substrings replaced by redacted
 * stand-ins. Pure function; safe to call on every outbound raft post.
 */
export function redactForPublic(text: string, options: RedactOptions = {}): string {
  const enabledJwts = options.jwts ?? true;
  let out = text;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    if (pattern.source.startsWith("eyJ") && !enabledJwts) continue;
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Test helper used by the runner's own sanity checks. Returns the list of
 * raw substrings that WOULD be redacted — useful for verifying a log line
 * or tool output isn't leaking secrets before it's surfaced.
 */
export function findCredentials(text: string): string[] {
  const found = new Set<string>();
  for (const { pattern } of REDACTION_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      found.add(match[0]);
    }
  }
  return [...found];
}
