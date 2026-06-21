import { defineTool } from "eve/tools";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Turso client — lazy-init singleton
// ---------------------------------------------------------------------------
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
  await client.batch([
    `CREATE TABLE IF NOT EXISTS nuggets (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      significance TEXT NOT NULL DEFAULT 'insight',
      source TEXT,
      recorded_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      author TEXT,
      published_date TEXT,
      summarized_at TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]'
    )`,
    `CREATE TABLE IF NOT EXISTS ideas (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      source_id TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      importance INTEGER NOT NULL DEFAULT 3,
      recorded_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      aliases TEXT NOT NULL DEFAULT '[]',
      recorded_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      source_id TEXT NOT NULL DEFAULT '',
      context TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      recorded_at TEXT NOT NULL
    )`,
    `CREATE VIRTUAL TABLE IF NOT EXISTS nuggets_fts USING fts5(
      content,
      category,
      significance,
      source,
      content='nuggets',
      content_rowid='rowid'
    )`,
    `CREATE VIRTUAL TABLE IF NOT EXISTS sources_fts USING fts5(
      url,
      title,
      author,
      summary,
      tags,
      content='sources',
      content_rowid='rowid'
    )`,
    `CREATE VIRTUAL TABLE IF NOT EXISTS ideas_fts USING fts5(
      content,
      source_id,
      tags,
      content='ideas',
      content_rowid='rowid'
    )`,
    `CREATE VIRTUAL TABLE IF NOT EXISTS topics_fts USING fts5(
      name,
      description,
      aliases,
      content='topics',
      content_rowid='rowid'
    )`,
    `CREATE VIRTUAL TABLE IF NOT EXISTS quotes_fts USING fts5(
      text,
      source_id,
      context,
      tags,
      content='quotes',
      content_rowid='rowid'
    )`,
    `CREATE TRIGGER IF NOT EXISTS nuggets_ai AFTER INSERT ON nuggets BEGIN
      INSERT INTO nuggets_fts(rowid, content, category, significance, source)
      VALUES (new.rowid, new.content, new.category, new.significance, new.source);
    END`,
    `CREATE TRIGGER IF NOT EXISTS nuggets_ad AFTER DELETE ON nuggets BEGIN
      INSERT INTO nuggets_fts(nuggets_fts, rowid, content, category, significance, source)
      VALUES ('delete', old.rowid, old.content, old.category, old.significance, old.source);
    END`,
    `CREATE TRIGGER IF NOT EXISTS nuggets_au AFTER UPDATE ON nuggets BEGIN
      INSERT INTO nuggets_fts(nuggets_fts, rowid, content, category, significance, source)
      VALUES ('delete', old.rowid, old.content, old.category, old.significance, old.source);
      INSERT INTO nuggets_fts(rowid, content, category, significance, source)
      VALUES (new.rowid, new.content, new.category, new.significance, new.source);
    END`,
    `CREATE TRIGGER IF NOT EXISTS sources_ai AFTER INSERT ON sources BEGIN
      INSERT INTO sources_fts(rowid, url, title, author, summary, tags)
      VALUES (new.rowid, new.url, new.title, new.author, new.summary, new.tags);
    END`,
    `CREATE TRIGGER IF NOT EXISTS sources_ad AFTER DELETE ON sources BEGIN
      INSERT INTO sources_fts(sources_fts, rowid, url, title, author, summary, tags)
      VALUES ('delete', old.rowid, old.url, old.title, old.author, old.summary, old.tags);
    END`,
    `CREATE TRIGGER IF NOT EXISTS sources_au AFTER UPDATE ON sources BEGIN
      INSERT INTO sources_fts(sources_fts, rowid, url, title, author, summary, tags)
      VALUES ('delete', old.rowid, old.url, old.title, old.author, old.summary, old.tags);
      INSERT INTO sources_fts(rowid, url, title, author, summary, tags)
      VALUES (new.rowid, new.url, new.title, new.author, new.summary, new.tags);
    END`,
    `CREATE TRIGGER IF NOT EXISTS ideas_ai AFTER INSERT ON ideas BEGIN
      INSERT INTO ideas_fts(rowid, content, source_id, tags)
      VALUES (new.rowid, new.content, new.source_id, new.tags);
    END`,
    `CREATE TRIGGER IF NOT EXISTS ideas_ad AFTER DELETE ON ideas BEGIN
      INSERT INTO ideas_fts(ideas_fts, rowid, content, source_id, tags)
      VALUES ('delete', old.rowid, old.content, old.source_id, old.tags);
    END`,
    `CREATE TRIGGER IF NOT EXISTS ideas_au AFTER UPDATE ON ideas BEGIN
      INSERT INTO ideas_fts(ideas_fts, rowid, content, source_id, tags)
      VALUES ('delete', old.rowid, old.content, old.source_id, old.tags);
      INSERT INTO ideas_fts(rowid, content, source_id, tags)
      VALUES (new.rowid, new.content, new.source_id, new.tags);
    END`,
    `CREATE TRIGGER IF NOT EXISTS topics_ai AFTER INSERT ON topics BEGIN
      INSERT INTO topics_fts(rowid, name, description, aliases)
      VALUES (new.rowid, new.name, new.description, new.aliases);
    END`,
    `CREATE TRIGGER IF NOT EXISTS topics_ad AFTER DELETE ON topics BEGIN
      INSERT INTO topics_fts(topics_fts, rowid, name, description, aliases)
      VALUES ('delete', old.rowid, old.name, old.description, old.aliases);
    END`,
    `CREATE TRIGGER IF NOT EXISTS topics_au AFTER UPDATE ON topics BEGIN
      INSERT INTO topics_fts(topics_fts, rowid, name, description, aliases)
      VALUES ('delete', old.rowid, old.name, old.description, old.aliases);
      INSERT INTO topics_fts(rowid, name, description, aliases)
      VALUES (new.rowid, new.name, new.description, new.aliases);
    END`,
    `CREATE TRIGGER IF NOT EXISTS quotes_ai AFTER INSERT ON quotes BEGIN
      INSERT INTO quotes_fts(rowid, text, source_id, context, tags)
      VALUES (new.rowid, new.text, new.source_id, new.context, new.tags);
    END`,
    `CREATE TRIGGER IF NOT EXISTS quotes_ad AFTER DELETE ON quotes BEGIN
      INSERT INTO quotes_fts(quotes_fts, rowid, text, source_id, context, tags)
      VALUES ('delete', old.rowid, old.text, old.source_id, old.context, old.tags);
    END`,
    `CREATE TRIGGER IF NOT EXISTS quotes_au AFTER UPDATE ON quotes BEGIN
      INSERT INTO quotes_fts(quotes_fts, rowid, text, source_id, context, tags)
      VALUES ('delete', old.rowid, old.text, old.source_id, old.context, old.tags);
      INSERT INTO quotes_fts(rowid, text, source_id, context, tags)
      VALUES (new.rowid, new.text, new.source_id, new.context, new.tags);
    END`,
    `INSERT INTO nuggets_fts(nuggets_fts) VALUES ('rebuild')`,
    `INSERT INTO sources_fts(sources_fts) VALUES ('rebuild')`,
    `INSERT INTO ideas_fts(ideas_fts) VALUES ('rebuild')`,
    `INSERT INTO topics_fts(topics_fts) VALUES ('rebuild')`,
    `INSERT INTO quotes_fts(quotes_fts) VALUES ('rebuild')`,
  ]);
}

// ---------------------------------------------------------------------------
// JSON array helpers (tags/aliases stored as JSON text in SQLite)
// ---------------------------------------------------------------------------
function parseJsonArray(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const p = JSON.parse(val);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toFtsQuery(query: string): string {
  const terms = query
    .trim()
    .split(/\s+/)
    .map((term) => term.replaceAll('"', '""'))
    .filter(Boolean);

  if (terms.length === 0) {
    throw new Error("'query' is required for search.");
  }

  return terms.map((term) => `"${term}"*`).join(" OR ");
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------
export default defineTool({
  description:
    "Store, search, or list structured knowledge entities in a Turso (libSQL) database. " +
    "Knowledge persists across all sessions and survives restarts. " +
    "Entity types: 'nugget' (quick fact), 'source' (article/page metadata), " +
    "'idea' (key insight), 'topic' (reusable theme), 'quote' (notable excerpt).",
  inputSchema: z.object({
    action: z.enum(["append", "search", "list", "stats"]),
    entity: z
      .enum(["nugget", "source", "idea", "topic", "quote"])
      .optional()
      .default("nugget"),
    // Shared fields
    content: z.string().optional(),
    category: z.string().optional(),
    source: z.string().optional(),
    tags: z.array(z.string()).optional(),
    query: z.string().optional(),
    limit: z.number().int().positive().max(50).optional(),
    // Source-specific
    title: z.string().optional(),
    author: z.string().optional(),
    publishedDate: z.string().optional(),
    summary: z.string().optional(),
    // Idea-specific
    sourceId: z.string().optional(),
    importance: z.number().int().min(1).max(5).optional(),
    // Topic-specific
    name: z.string().optional(),
    description: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    // Quote-specific
    text: z.string().optional(),
    context: z.string().optional(),
  }),
  async execute(input) {
    const client = await db();
    const entity = input.entity;
    const now = new Date().toISOString();

    // Helper: map a DB row to a clean object for each entity type
    function rowToObj(entity: string, row: Record<string, unknown>) {
      switch (entity) {
        case "nugget":
          return {
            id: row.id,
            content: row.content,
            category: row.category,
            significance: row.significance,
            source: row.source ?? undefined,
            recordedAt: row.recorded_at,
          };
        case "source":
          return {
            id: row.id,
            url: row.url,
            title: row.title,
            author: row.author ?? undefined,
            publishedDate: row.published_date ?? undefined,
            summarizedAt: row.summarized_at,
            summary: row.summary,
            tags: parseJsonArray(row.tags),
          };
        case "idea":
          return {
            id: row.id,
            content: row.content,
            sourceId: row.source_id,
            tags: parseJsonArray(row.tags),
            importance: row.importance,
            recordedAt: row.recorded_at,
          };
        case "topic":
          return {
            id: row.id,
            name: row.name,
            description: row.description,
            aliases: parseJsonArray(row.aliases),
            recordedAt: row.recorded_at,
          };
        case "quote":
          return {
            id: row.id,
            text: row.text,
            sourceId: row.source_id,
            context: row.context,
            tags: parseJsonArray(row.tags),
            recordedAt: row.recorded_at,
          };
        default:
          return row;
      }
    }

    switch (input.action) {
      // -----------------------------------------------------------------------
      // APPEND
      // -----------------------------------------------------------------------
      case "append": {
        const table = `${entity}s`;
        const id = `${entity.slice(0, 3)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        switch (entity) {
          case "nugget": {
            if (!input.content)
              throw new Error("'content' is required for nugget append.");
            await client.execute({
              sql: "INSERT INTO nuggets (id, content, category, significance, source, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
              args: [
                id,
                input.content,
                input.category ?? "general",
                "insight",
                input.source ?? null,
                now,
              ],
            });
            break;
          }
          case "source": {
            await client.execute({
              sql: "INSERT INTO sources (id, url, title, author, published_date, summarized_at, summary, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              args: [
                id,
                input.source ?? "",
                input.title ?? input.content ?? "(untitled)",
                input.author ?? null,
                input.publishedDate ?? null,
                now,
                input.summary ?? input.content ?? "",
                JSON.stringify(input.tags ?? []),
              ],
            });
            break;
          }
          case "idea": {
            if (!input.content)
              throw new Error("'content' is required for idea append.");
            await client.execute({
              sql: "INSERT INTO ideas (id, content, source_id, tags, importance, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
              args: [
                id,
                input.content,
                input.sourceId ?? "",
                JSON.stringify(input.tags ?? []),
                input.importance ?? 3,
                now,
              ],
            });
            break;
          }
          case "topic": {
            await client.execute({
              sql: "INSERT INTO topics (id, name, description, aliases, recorded_at) VALUES (?, ?, ?, ?, ?)",
              args: [
                id,
                input.name ?? input.content ?? "(unnamed)",
                input.description ?? input.content ?? "",
                JSON.stringify(input.aliases ?? []),
                now,
              ],
            });
            break;
          }
          case "quote": {
            const quoteText = input.text ?? input.content;
            if (!quoteText)
              throw new Error(
                "'text' or 'content' is required for quote append.",
              );
            await client.execute({
              sql: "INSERT INTO quotes (id, text, source_id, context, tags, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
              args: [
                id,
                quoteText,
                input.sourceId ?? input.source ?? "",
                input.context ?? "",
                JSON.stringify(input.tags ?? []),
                now,
              ],
            });
            break;
          }
        }

        return { summary: `Stored ${entity} "${id}".`, entity: { id } };
      }

      // -----------------------------------------------------------------------
      // SEARCH
      // -----------------------------------------------------------------------
      case "search": {
        if (!input.query) throw new Error("'query' is required for search.");
        const limit = input.limit ?? 20;
        const table = `${entity}s`;
        const ftsTable = `${table}_fts`;
        const ftsQuery = toFtsQuery(input.query);

        const result = await client.execute({
          sql: `
            SELECT base.*
            FROM ${table} AS base
            JOIN ${ftsTable} AS fts ON fts.rowid = base.rowid
            WHERE ${ftsTable} MATCH ?
            ORDER BY bm25(${ftsTable}), base.rowid DESC
            LIMIT ?
          `,
          args: [ftsQuery, limit],
        });

        const rows = result.rows.map((r) =>
          rowToObj(entity, r as Record<string, unknown>),
        );

        if (rows.length === 0) {
          return { summary: `No ${entity}s match "${input.query}".` };
        }

        const key = entity === "nugget" ? "nugget" : `${entity}s`;
        return {
          summary: `Found ${rows.length} matching ${entity}(s).`,
          [key]: rows,
        };
      }

      // -----------------------------------------------------------------------
      // LIST
      // -----------------------------------------------------------------------
      case "list": {
        const limit = input.limit ?? 20;
        const table = `${entity}s`;

        const result = await client.execute({
          sql: `SELECT * FROM ${table} ORDER BY rowid DESC LIMIT ?`,
          args: [limit],
        });

        const rows = result.rows.map((r) =>
          rowToObj(entity, r as Record<string, unknown>),
        );

        if (rows.length === 0) {
          return { summary: `No ${entity}s stored yet.` };
        }

        const key = entity === "nugget" ? "nugget" : `${entity}s`;
        return {
          summary: `${rows.length} ${entity}(s) (most recent).`,
          [key]: rows,
        };
      }

      // -----------------------------------------------------------------------
      // STATS
      // -----------------------------------------------------------------------
      case "stats": {
        const table = `${entity}s`;
        const countResult = await client.execute(
          `SELECT COUNT(*) AS cnt FROM ${table}`,
        );
        const total = Number(
          (countResult.rows[0] as Record<string, unknown>).cnt ?? 0,
        );

        return {
          [entity]: { total },
          database: process.env.TURSO_DATABASE_URL ?? "(local)",
          summary: `${total} ${entity}(s) in the database.`,
        };
      }

      default:
        throw new Error(`Unknown action: ${input.action}`);
    }
  },
});
