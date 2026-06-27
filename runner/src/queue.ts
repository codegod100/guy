// Outbound message queue: lets eve tools enqueue raft posts from inside an
// agent turn. The runner drains the queue at the start of each poll tick and
// forwards due rows via `raft.messageSend`.
//
// Use cases:
//   - Send a message after a delay (`sendAfter` ISO timestamp).
//   - Forward a tool's result to raft without holding up the eve turn.
//   - Decouple a long-running background task from the response stream —
//     the tool writes a row and returns; the runner picks it up later.
//
// Schema:
//   pending_messages(
//     id          TEXT PRIMARY KEY,
//     target      TEXT NOT NULL,            -- raft target (channel/thread)
//     body        TEXT NOT NULL,
//     send_after  TEXT,                     -- ISO; NULL = send ASAP
//     status      TEXT NOT NULL,            -- 'pending' | 'sent' | 'failed'
//     attempts    INTEGER NOT NULL DEFAULT 0,
//     last_error  TEXT,
//     context     TEXT,                     -- JSON metadata (msgId, author)
//     created_at  TEXT NOT NULL,
//     sent_at     TEXT
//   )
//
// Lifecycle:
//   enqueue       → status='pending', attempts=0
//   send success  → status='sent', sent_at=now
//   send failure  → attempts++, last_error=… (still 'pending')
//   attempts ≥ N  → status='failed' (terminal; not retried)

import { createClient, type Client } from "@libsql/client";
import { nanoid } from "nanoid";
import { getLogger } from "./logger.ts";

export type OutboundMessage = {
  id: string;
  target: string;
  body: string;
  sendAfter: string | null;
  attempts: number;
  context: Record<string, unknown> | null;
  createdAt: string;
};

export type EnqueueOpts = {
  target: string;
  body: string;
  /** ISO timestamp; omit to send ASAP. */
  sendAfter?: string;
  /** Free-form metadata persisted alongside the row. */
  context?: Record<string, unknown>;
  /** Override the auto-generated id (mostly for tests). */
  id?: string;
};

export class OutboundQueue {
  private readonly log = getLogger().child({ component: "queue" });

  private constructor(private readonly client: Client) {}

  static async open(url: string, authToken?: string): Promise<OutboundQueue> {
    const client = createClient({ url, authToken });
    const queue = new OutboundQueue(client);
    queue.log.info("queue opened", { url });
    await initSchema(client);
    queue.log.debug("schema ready", { table: "pending_messages" });
    return queue;
  }

  async enqueue(opts: EnqueueOpts): Promise<{ id: string }> {
    const id = opts.id ?? nanoid();
    const createdAt = new Date().toISOString();
    await this.client.execute({
      sql: `INSERT INTO pending_messages
              (id, target, body, send_after, status, attempts, context, created_at)
            VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)`,
      args: [
        id,
        opts.target,
        opts.body,
        opts.sendAfter ?? null,
        opts.context ? JSON.stringify(opts.context) : null,
        createdAt,
      ],
    });
    this.log.info("db.enqueue", {
      id,
      target: opts.target,
      sendAfter: opts.sendAfter ?? null,
      bytes: opts.body.length,
    });
    return { id };
  }

  /**
   * Pull up to `limit` rows that are due to send. A row is due when
   * `status='pending'` and either `send_after IS NULL` or `send_after <= now`.
   * The caller is expected to call `markSent` or `recordFailure` for each
   * row after attempting to send it; rows stay `'pending'` on transient
   * failure so they'll be retried next tick.
   */
  async claimReady(
    limit: number,
    now: Date = new Date(),
  ): Promise<OutboundMessage[]> {
    const result = await this.client.execute({
      sql: `SELECT id, target, body, send_after, attempts, context, created_at
            FROM pending_messages
            WHERE status = 'pending'
              AND (send_after IS NULL OR send_after <= ?)
            ORDER BY created_at
            LIMIT ?`,
      args: [now.toISOString(), limit],
    });
    return result.rows.map((row) => ({
      id: row.id as string,
      target: row.target as string,
      body: row.body as string,
      sendAfter: (row.send_after as string) ?? null,
      attempts: Number(row.attempts),
      context: row.context
        ? (JSON.parse(row.context as string) as Record<string, unknown>)
        : null,
      createdAt: row.created_at as string,
    }));
  }

  async markSent(id: string): Promise<void> {
    await this.client.execute({
      sql: `UPDATE pending_messages
            SET status = 'sent', sent_at = ?, last_error = NULL
            WHERE id = ?`,
      args: [new Date().toISOString(), id],
    });
    this.log.debug("db.markSent", { id });
  }

  /**
   * Record a transient failure: bumps `attempts` and stores the error
   * string, but keeps `status='pending'` so the row will be retried on
   * the next tick. Use {@link markFailed} to mark terminal failure once
   * `attempts` reaches the retry cap.
   */
  async recordFailure(id: string, error: string): Promise<void> {
    await this.client.execute({
      sql: `UPDATE pending_messages
            SET attempts = attempts + 1, last_error = ?
            WHERE id = ?`,
      args: [error, id],
    });
    this.log.debug("db.recordFailure", { id, error });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.client.execute({
      sql: `UPDATE pending_messages
            SET status = 'failed', attempts = attempts + 1, last_error = ?
            WHERE id = ?`,
      args: [error, id],
    });
    this.log.info("db.markFailed", { id, error });
  }

  async close(): Promise<void> {
    await this.client.close();
    this.log.debug("queue closed");
  }
}

async function initSchema(client: Client): Promise<void> {
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
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_pending_messages_created_at
    ON pending_messages (created_at)
  `);
}