// Drafts the human-readable posts the runner sends back to Raft.
//
// Per raft.md §"Communication style":
//   - Acknowledge with a reaction (👀) before starting — no new "Acknowledged."
//     post on every poll.
//   - Send short progress updates (one or two sentences) for multi-step work.
//   - Summarize the result when done.
//   - Don't flood; skip idle narration.
//
// All functions return redacted text — callers must not skip the redaction
// step. Drafts use plain @mentions, #channel refs, and bare URLs per raft.md
// formatting rules.

import { redactForPublic } from "./redact.ts";

/** Optional progress note — runner only sends these when there's something to say. */
export function draftProgress(note: string): { body: string } {
  return { body: redactForPublic(`Progress: ${note}`) };
}

/**
 * Final summary posted when the eve turn completes, before status → in_review.
 * The full eve output is sent verbatim (after a single trim) — the user asked
 * for the untruncated text, so any size limits are the raft server's problem,
 * not ours.
 */
export function draftSummary(opts: {
  eveText: string;
  status: "completed" | "failed" | "waiting";
  sessionId?: string;
}): { body: string } {
  const text = opts.eveText.trim();
  const statusLine =
    opts.status === "completed"
      ? "eve turn completed."
      : opts.status === "failed"
        ? "eve turn failed."
        : "eve turn paused (waiting for input).";

  const body =
    `Done.\n` +
    `**Status:** ${statusLine}\n` +
    (opts.sessionId ? `**Session:** ${opts.sessionId}\n` : "") +
    `\n---\n${text}`;
  return { body: redactForPublic(body) };
}
