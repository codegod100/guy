/**
 * Turso-backed threads store.
 *
 * Each thread belongs to a user (identified via Vercel OIDC) and carries the
 * eve session cursor needed to resume the conversation on page reload.
 */

let _db: import("@libsql/client").Client | null = null;

async function db(): Promise<import("@libsql/client").Client> {
  if (_db) return _db;
  const { createClient } = await import("@libsql/client");

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL is not set. Get a database URL from https://turso.tech.",
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
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      initial_message TEXT NOT NULL,
      session_id TEXT,
      continuation_token TEXT,
      stream_index INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_threads_user_id
    ON threads (user_id)
  `);
}

export interface ThreadRecord {
  readonly id: string;
  readonly userId: string;
  readonly initialMessage: string;
  readonly sessionId: string | null;
  readonly continuationToken: string | null;
  readonly streamIndex: number;
  readonly updatedAt: string;
}

export async function getThreads(userId: string): Promise<readonly ThreadRecord[]> {
  const client = await db();
  const result = await client.execute({
    sql: `SELECT * FROM threads WHERE user_id = ? ORDER BY updated_at DESC`,
    args: [userId],
  });

  return result.rows.map(mapRow);
}

export async function upsertThread(
  thread: Omit<ThreadRecord, "updatedAt"> & { readonly updatedAt?: string },
): Promise<void> {
  const client = await db();
  const now = thread.updatedAt ?? new Date().toISOString();

  await client.execute({
    sql: `
      INSERT INTO threads (id, user_id, initial_message, session_id, continuation_token, stream_index, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        initial_message = excluded.initial_message,
        session_id = excluded.session_id,
        continuation_token = excluded.continuation_token,
        stream_index = excluded.stream_index,
        updated_at = excluded.updated_at
    `,
    args: [
      thread.id,
      thread.userId,
      thread.initialMessage,
      thread.sessionId,
      thread.continuationToken,
      thread.streamIndex,
      now,
    ],
  });
}

export async function deleteThread(
  id: string,
  userId: string,
): Promise<void> {
  const client = await db();
  await client.execute({
    sql: `DELETE FROM threads WHERE id = ? AND user_id = ?`,
    args: [id, userId],
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RawRow = Record<string, unknown>;

function mapRow(row: RawRow): ThreadRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    initialMessage: row.initial_message as string,
    sessionId: (row.session_id as string) ?? null,
    continuationToken: (row.continuation_token as string) ?? null,
    streamIndex: Number(row.stream_index),
    updatedAt: row.updated_at as string,
  };
}
