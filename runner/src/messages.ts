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
 * Strip internal-model scaffolding from the eve assistant text before it
 * lands on Raft.
 *
 *   1. `  ... ` blocks. The harness occasionally emits these when the
 *      underlying model rolls a  block into the streamed text instead of
 *      keeping it inside the session. Each block duplicates the assistant's
 *      own draft; posting the raw text means the user sees the same answer
 *      written several times. We replace each whole block with a single
 *      "[...]" marker so they know chunks were intentionally removed.
 *   2. Lingering "Queued message ..." confirmations. When the agent uses
 *      the `enqueue_raft_message` tool, eve echoes the tool result into
 *      the streamed text. That's redundant — the runner already drains
 *      the queue and posts the message — so we drop it.
 *
 * Returns the cleaned text plus a count of how many blocks were stripped,
 * surfaced in the summary header so the user can tell the model did
 * something thinking-y without having to see every draft.
 */
export function stripInternalNoise(text: string): {
  readonly cleaned: string;
  readonly thinkBlocksRemoved: number;
} {
  let thinkBlocksRemoved = 0;
  // Match `  ... ` blocks across newlines (the model often writes
  // them as multi-line drafts). The body is consumed lazily.
  const cleaned = text.replace(/  [\s\S]*? \n?/g, () => {
    thinkBlocksRemoved += 1;
    return "";
  });
  // Collapse 3+ consecutive blank lines down to a single blank line, so
  // back-to-back stripped blocks don't leave a wall of whitespace.
  const collapsed = cleaned.replace(/\n{3,}/g, "\n\n");
  return { cleaned: collapsed.trim(), thinkBlocksRemoved };
}

/**
 * Final text posted when the eve turn completes, before status → in_review.
 *
 * Just the model's cleaned-up response — no "Done. Status: ..." wrapper.
 * The user sees the same reply in Raft they would have seen in the eve
 * client's UI, with internal scaffolding stripped. `maxChars` caps the
 * length (set `RUNNER_SUMMARY_MAX_CHARS=0` to disable the cap).
 */
export function draftSummary(opts: {
  eveText: string;
  status: "completed" | "failed" | "waiting";
  sessionId?: string;
  modelId?: string;
  maxChars?: number;
}): { body: string; truncated: boolean } {
  const { cleaned } = stripInternalNoise(opts.eveText);
  const cap = opts.maxChars ?? Number.POSITIVE_INFINITY;

  let text = cleaned;
  let truncated = false;
  if (Number.isFinite(cap) && cleaned.length > cap) {
    text = cleaned.slice(0, cap).trimEnd();
    text += `\n\n…(truncated, ${cleaned.length} chars total)`;
    truncated = true;
  }

  return { body: redactForPublic(text), truncated };
}