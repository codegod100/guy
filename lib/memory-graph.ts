import { createClient, type Client } from "@libsql/client";

let dbClient: Client | null = null;

async function db(): Promise<Client> {
  if (dbClient) return dbClient;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL is not set. Get a database URL from https://turso.tech.",
    );
  }

  dbClient = createClient({ url, authToken });
  return dbClient;
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function truncate(text: string, max = 120): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export type MemoryGraphNodeType =
  | "source"
  | "idea"
  | "topic"
  | "quote"
  | "nugget";

export interface MemoryGraphNode {
  readonly id: string;
  readonly type: MemoryGraphNodeType;
  readonly label: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly size: number;
  readonly metadata: Record<string, string | number | readonly string[] | null>;
}

export interface MemoryGraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: "references" | "tagged" | "mentions" | "origin";
  readonly label: string;
  readonly strength: number;
}

export interface MemoryGraphData {
  readonly nodes: readonly MemoryGraphNode[];
  readonly edges: readonly MemoryGraphEdge[];
  readonly totals: Record<MemoryGraphNodeType, number>;
}

interface SourceRow {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly author: string | null;
  readonly published_date: string | null;
  readonly summarized_at: string;
  readonly summary: string;
  readonly tags: unknown;
}

interface IdeaRow {
  readonly id: string;
  readonly content: string;
  readonly source_id: string;
  readonly tags: unknown;
  readonly importance: number;
  readonly recorded_at: string;
}

interface TopicRow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly aliases: unknown;
  readonly recorded_at: string;
}

interface QuoteRow {
  readonly id: string;
  readonly text: string;
  readonly source_id: string;
  readonly context: string;
  readonly tags: unknown;
  readonly recorded_at: string;
}

interface NuggetRow {
  readonly id: string;
  readonly content: string;
  readonly category: string;
  readonly significance: string;
  readonly source: string | null;
  readonly recorded_at: string;
}

export async function getMemoryGraphData(): Promise<MemoryGraphData> {
  const client = await db();

  const [
    sourcesResult,
    ideasResult,
    topicsResult,
    quotesResult,
    nuggetsResult,
  ] = await Promise.all([
    client.execute("SELECT * FROM sources ORDER BY rowid DESC LIMIT 200"),
    client.execute("SELECT * FROM ideas ORDER BY rowid DESC LIMIT 300"),
    client.execute("SELECT * FROM topics ORDER BY rowid DESC LIMIT 150"),
    client.execute("SELECT * FROM quotes ORDER BY rowid DESC LIMIT 200"),
    client.execute("SELECT * FROM nuggets ORDER BY rowid DESC LIMIT 150"),
  ]);

  const sources = sourcesResult.rows as unknown as SourceRow[];
  const ideas = ideasResult.rows as unknown as IdeaRow[];
  const topics = topicsResult.rows as unknown as TopicRow[];
  const quotes = quotesResult.rows as unknown as QuoteRow[];
  const nuggets = nuggetsResult.rows as unknown as NuggetRow[];

  const nodes: MemoryGraphNode[] = [];
  const edges: MemoryGraphEdge[] = [];
  const seenEdges = new Set<string>();
  const sourceIds = new Set(sources.map((source) => source.id));

  const topicIndex = topics.map((topic) => {
    const aliases = parseJsonArray(topic.aliases);
    const needles = [topic.name, ...aliases]
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    return {
      id: topic.id,
      needles,
    };
  });

  const addEdge = (edge: MemoryGraphEdge) => {
    const key = `${edge.source}:${edge.target}:${edge.kind}:${edge.label}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    edges.push(edge);
  };

  for (const source of sources) {
    const tags = parseJsonArray(source.tags);
    nodes.push({
      id: source.id,
      type: "source",
      label: source.title || source.url || source.id,
      description: truncate(source.summary || source.url || "Source"),
      tags,
      size: 26 + Math.min(tags.length * 2, 10),
      metadata: {
        url: source.url,
        author: source.author,
        publishedDate: source.published_date,
        summarizedAt: source.summarized_at,
        tags,
      },
    });
  }

  for (const idea of ideas) {
    const tags = parseJsonArray(idea.tags);
    nodes.push({
      id: idea.id,
      type: "idea",
      label: truncate(idea.content, 48),
      description: truncate(idea.content, 160),
      tags,
      size: 20 + idea.importance * 3,
      metadata: {
        sourceId: idea.source_id,
        importance: idea.importance,
        recordedAt: idea.recorded_at,
        tags,
      },
    });

    if (idea.source_id && sourceIds.has(idea.source_id)) {
      addEdge({
        id: `${idea.id}->${idea.source_id}:references`,
        source: idea.id,
        target: idea.source_id,
        kind: "references",
        label: "from source",
        strength: 1,
      });
    }
  }

  for (const topic of topics) {
    const aliases = parseJsonArray(topic.aliases);
    nodes.push({
      id: topic.id,
      type: "topic",
      label: topic.name,
      description: truncate(topic.description || topic.name),
      tags: aliases,
      size: 24 + Math.min(aliases.length * 2, 10),
      metadata: {
        aliases,
        recordedAt: topic.recorded_at,
      },
    });
  }

  for (const quote of quotes) {
    const tags = parseJsonArray(quote.tags);
    nodes.push({
      id: quote.id,
      type: "quote",
      label: truncate(quote.text, 42),
      description: truncate(quote.context || quote.text, 160),
      tags,
      size: 18 + Math.min(tags.length * 2, 8),
      metadata: {
        sourceId: quote.source_id,
        recordedAt: quote.recorded_at,
        tags,
      },
    });

    if (quote.source_id && sourceIds.has(quote.source_id)) {
      addEdge({
        id: `${quote.id}->${quote.source_id}:origin`,
        source: quote.id,
        target: quote.source_id,
        kind: "origin",
        label: "quoted from",
        strength: 0.95,
      });
    }
  }

  for (const nugget of nuggets) {
    nodes.push({
      id: nugget.id,
      type: "nugget",
      label: truncate(nugget.content, 44),
      description: truncate(nugget.content, 160),
      tags: [nugget.category, nugget.significance].filter(Boolean),
      size: 18,
      metadata: {
        category: nugget.category,
        significance: nugget.significance,
        source: nugget.source,
        recordedAt: nugget.recorded_at,
      },
    });

    if (nugget.source) {
      const matchingSource = sources.find(
        (source) => source.url === nugget.source || source.id === nugget.source,
      );

      if (matchingSource) {
        addEdge({
          id: `${nugget.id}->${matchingSource.id}:origin`,
          source: nugget.id,
          target: matchingSource.id,
          kind: "origin",
          label: "derived from",
          strength: 0.75,
        });
      }
    }
  }

  const linkTopicMatches = (
    nodeId: string,
    haystacks: readonly string[],
    exactTags: readonly string[],
  ) => {
    const loweredHaystacks = haystacks.map((value) => value.toLowerCase());
    const loweredTags = new Set(exactTags.map((tag) => tag.toLowerCase()));

    for (const topic of topicIndex) {
      const tagMatch = topic.needles.some((needle) => loweredTags.has(needle));
      const textMatch = topic.needles.some((needle) =>
        loweredHaystacks.some((haystack) => haystack.includes(needle)),
      );

      if (tagMatch || textMatch) {
        addEdge({
          id: `${nodeId}->${topic.id}:${tagMatch ? "tagged" : "mentions"}`,
          source: nodeId,
          target: topic.id,
          kind: tagMatch ? "tagged" : "mentions",
          label: tagMatch ? "tagged with topic" : "mentions topic",
          strength: tagMatch ? 0.7 : 0.45,
        });
      }
    }
  };

  for (const source of sources) {
    linkTopicMatches(
      source.id,
      [source.title, source.summary, source.url],
      parseJsonArray(source.tags),
    );
  }

  for (const idea of ideas) {
    linkTopicMatches(idea.id, [idea.content], parseJsonArray(idea.tags));
  }

  for (const quote of quotes) {
    linkTopicMatches(
      quote.id,
      [quote.text, quote.context],
      parseJsonArray(quote.tags),
    );
  }

  for (const nugget of nuggets) {
    linkTopicMatches(
      nugget.id,
      [nugget.content, nugget.category],
      [nugget.category],
    );
  }

  return {
    nodes,
    edges,
    totals: {
      source: sources.length,
      idea: ideas.length,
      topic: topics.length,
      quote: quotes.length,
      nugget: nuggets.length,
    },
  };
}
