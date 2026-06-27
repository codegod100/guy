// Durable store for message ids the runner has already processed.
//
// Background: in `self-hosted-runner` mode the raft CLI doesn't call
// `/receive-ack`, so the server keeps redelivering the same ids on every
// poll. A direct ack from the runner isn't possible — the endpoint requires
// a machine API key (`sk_machine_*`) and the runner profile only has an
// agent API key (`sk_agent_*`). So the runner dedupes client-side.
//
// Without persistence, the in-memory dedup set is wiped on restart and
// every redelivered id triggers another full turn (ack → eve → summary).
// This store keeps the dedup state in libsql so restarts are cheap.
//
// Schema:
//   seen_messages(
//     id       TEXT PRIMARY KEY,
//     status   TEXT NOT NULL,    -- 'skipped' | 'processed'
//     seen_at  TEXT NOT NULL     -- ISO timestamp, for retention pruning
//   )
//
// Two status values:
//   - 'skipped':    we saw the message and decided not to do work
//                   (own echo, or message not addressed to us).
//   - 'processed':  we ran the full turn for this message.
//
// INSERT OR IGNORE means re-marking an already-seen id is a no-op, so the
// repeated redeliveries from raft are cheap to absorb.

import { createClient, type Client, type ResultSet } from "@libsql/client";
import { getLogger } from "./logger.ts";

export type SeenStatus = "skipped" | "processed";

export class MessageStore {
  private readonly log = getLogger().child({ component: "store" });

  private constructor(private readonly client: Client) {}

  /**
   * Open a libsql connection and ensure the schema exists. Throws on
   * connection failure — the caller (main.ts) surfaces that as a startup
   * error. We don't silently fall back to an in-memory store: a runner
   * that can't persist would re-process everything on restart, which is
   * exactly the bug this module exists to prevent.
   */
  static async open(url: string, authToken?: string): Promise<MessageStore> {
    const client = createClient({ url, authToken });
    const store = new MessageStore(client);
    store.log.info("store opened", { url, authToken: Boolean(authToken) });
    await initSchema(client);
    store.log.debug("schema ready", { table: "seen_messages" });
    return store;
  }

  /**
   * Return every seen id, for hydrating the in-memory dedup set at startup.
   * The result is a Set so per-message `has()` is O(1).
   */
  async loadSeenIds(): Promise<Set<string>> {
    const start = Date.now();
    const result = await this.client.execute(
      "SELECT id FROM seen_messages",
    );
    const set = new Set<string>();
    for (const row of result.rows) {
      const id = row.id;
      if (typeof id === "string") set.add(id);
    }
    this.log.debug("db.loadSeenIds", {
      count: set.size,
      durationMs: Date.now() - start,
    });
    return set;
  }

  /**
   * Record that we've handled `id`. INSERT OR IGNORE: safe to call for an id
   * that's already recorded (raft redelivery, our own echo from a previous
   * turn, etc.) — the original `status` and `seen_at` are preserved.
   *
   * Logs every call at debug so a stuck-runner diagnosis can confirm
   * writes are completing. `rowsAffected` distinguishes fresh inserts (1)
   * from no-op duplicates (0), which is useful when raft is redelivering.
   */
  async markSeen(id: string, status: SeenStatus): Promise<void> {
    const start = Date.now();
    const result: ResultSet = await this.client.execute({
      sql: "INSERT OR IGNORE INTO seen_messages (id, status, seen_at) VALUES (?, ?, ?)",
      args: [id, status, new Date().toISOString()],
    });
    this.log.debug("db.markSeen", {
      id,
      status,
      rowsAffected: result.rowsAffected,
      durationMs: Date.now() - start,
    });
  }

  async close(): Promise<void> {
    const start = Date.now();
    await this.client.close();
    this.log.debug("store closed", { durationMs: Date.now() - start });
  }
}

async function initSchema(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS seen_messages (
      id      TEXT PRIMARY KEY,
      status  TEXT NOT NULL CHECK (status IN ('skipped','processed')),
      seen_at TEXT NOT NULL
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_seen_messages_seen_at
    ON seen_messages (seen_at)
  `);
}