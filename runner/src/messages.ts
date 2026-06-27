// Drafts the human-readable posts the runner sends back to Raft.
//
// Per raft.md §"Communication style":
//   - Acknowledge the task and outline the plan before starting.
//   - Send short progress updates (one or two sentences) for multi-step work.
//   - Summarize the result when done.
//   - Don't flood; skip idle narration.
//
// All functions return redacted text — callers must not skip the redaction
// step. Drafts use plain @mentions, #channel refs, and bare URLs per raft.md
// formatting rules.

import { redactForPublic } from "./redact.ts";

export type AckDraft = {
  body: string;
};

/**
 * Initial ack for a task message: "Got it, here's the plan." Includes the
 * task title and the planned steps so the human can see what's about to
 * happen. Reserved for messages with `[task #N status=…]` — plain DMs and
 * conversation turns use {@link draftMessageAck} instead.
 */
export function draftTaskAck(opts: {
  taskTitle: string;
  plan: string[];
}): AckDraft {
  const planList = opts.plan.map((step) => `- ${step}`).join("\n");
  const body =
    `Acknowledged.\n` +
    `**Task:** ${opts.taskTitle}\n` +
    `**Plan:**\n${planList}`;
  return { body: redactForPublic(body) };
}

/**
 * Initial ack for a plain (non-task) message. The task/plan layout from
 * {@link draftTaskAck} reads strangely on a conversational DM — there's no
 * task title to summarize and the plan doesn't apply — so non-task turns
 * just get a one-liner acknowledgment before the eve turn runs.
 */
export function draftMessageAck(): AckDraft {
  return { body: redactForPublic("Acknowledged.") };
}

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
