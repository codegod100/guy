// Enqueue a message for the runner to post to Raft. The runner drains the
// `pending_messages` table at the start of every poll tick and forwards
// each due row via `raft message send` — so the tool's execute() can
// return immediately and the post lands asynchronously.
//
// Use cases:
//   - Post a follow-up after some delay (e.g. "remind me in 30 minutes").
//   - Forward a long-running task's result without holding up the eve turn.
//   - Reply from a tool without the agent having to round-trip back.
//
// Required: `body`, `target`. The runner injects `raft_target` into the
// clientContext for every eve turn (the thread target computed by
// `threadTarget()`), so the model knows what to pass for `target` when
// posting back to the originating thread. For cross-thread posts, the
// model fills in the explicit channel/target.

import { defineTool } from "eve/tools";
import { z } from "zod";

let _db: import("@libsql/client").Client | null = null;

async function db(): Promise<import("@libsql/client").Client> {
  if (_db) return _db;
  const { createClient } = await import("@libsql/client");

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL is not set. The enqueue_raft_message tool writes " +
        "to the runner's outbound queue, which lives in the project's Turso " +
        "database. Configure TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN) in your " +
        ".env.local.",
    );
  }

  _db = createClient({ url, authToken });
  await initSchema(_db);
  return _db;
}

async function initSchema(
  client: import("@libsql/client").Client,
): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS pending_messages (
      id         TEXT PRIMARY KEY,
      target     TEXT NOT NULL,
      body       TEXT NOT NULL,
      send_after TEXT,
      status     TEXT NOT NULL CHECK (status IN ('pending','sent','failed')),
      attempts   INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      context    TEXT,
      created_at TEXT NOT NULL,
      sent_at    TEXT
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_pending_messages_status_sendafter
    ON pending_messages (status, send_after)
  `);
}

export default defineTool({
  description:
    "Queue a message for the runner to post to Raft. The runner drains " +
    "the queue on each poll tick (default ~5s) so the post lands " +
    "asynchronously without holding up the eve turn. Use `sendAfter` to " +
    "delay delivery until a specific ISO timestamp. `target` defaults " +
    "are NOT automatic — pass the `raft_target` from this turn's " +
    "clientContext when posting back to the originating thread.",
  inputSchema: z.object({
    body: z.string().min(1).describe("Message body to post."),
    target: z
      .string()
      .min(1)
      .describe(
        "Raft target. For a reply to the current thread, pass the " +
          "`raft_target` value from this turn's clientContext. Format: " +
          "`#channel`, `dm:@handle`, or `target:shortid` for a thread.",
      ),
    sendAfter: z
      .string()
      .datetime()
      .optional()
      .describe(
        "Optional ISO timestamp; the runner will not post until then. " +
          "Omit to send ASAP on the next drain.",
      ),
  }),
  async execute({ body, target, sendAfter }) {
    const client = await db();
    const id = `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();

    await client.execute({
      sql: `INSERT INTO pending_messages
              (id, target, body, send_after, status, attempts, context, created_at)
            VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)`,
      args: [id, target, body, sendAfter ?? null, null, createdAt],
    });

    return {
      summary: `Queued message ${id} for ${target}${
        sendAfter ? ` (after ${sendAfter})` : " (ASAP)"
      }.`,
      id,
      target,
      sendAfter: sendAfter ?? null,
    };
  },
});