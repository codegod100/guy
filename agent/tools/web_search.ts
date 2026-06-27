// The runtime tool name comes from the filename, so the model sees `web_search`.
//
// Tavily is a search API designed for AI agents: results are pre-cleaned and
// the service can synthesize a direct answer from the top hits. We hit the
// REST endpoint directly to match the no-deps pattern of `get_markdown.ts`.
//
// API: https://docs.tavily.com/docs/rest-api/api-reference

import { defineTool } from "eve/tools";
import { z } from "zod";
import { getLogger, errFields } from "../lib/logger.ts";

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const DEFAULT_MAX_RESULTS = 5;
const MAX_MAX_RESULTS = 20;

const log = getLogger().child({ component: "web_search" });

export default defineTool({
  description:
    "Search the web via Tavily. Returns ranked results with title, URL, " +
    "and a short content snippet per hit, plus an optional synthesized " +
    "answer. Use for up-to-date info, current events, or anything not in " +
    "training data. Prefer fetching a specific URL with `get_markdown` when " +
    "the source is already known.",
  inputSchema: z.object({
    query: z.string().min(1).describe("Natural-language search query."),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(MAX_MAX_RESULTS)
      .optional()
      .default(DEFAULT_MAX_RESULTS)
      .describe(
        `Max results to return (1-${MAX_MAX_RESULTS}; default ${DEFAULT_MAX_RESULTS}).`,
      ),
    searchDepth: z
      .enum(["basic", "advanced"])
      .optional()
      .default("basic")
      .describe(
        "`basic` is fast and cheap; `advanced` runs deeper retrieval and " +
          "costs more Tavily credits.",
      ),
    topic: z
      .enum(["general", "news", "finance"])
      .optional()
      .default("general")
      .describe("Result bias; `news` favors recent articles, `finance` financial sources."),
    includeAnswer: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, Tavily synthesizes a direct answer from the top hits. " +
          "Adds one extra model call on Tavily's side and consumes credits.",
      ),
  }),
  async execute({ query, maxResults, searchDepth, topic, includeAnswer }) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw new Error(
        "TAVILY_API_KEY is not set. Get a key at https://tavily.com and add " +
          "it to .env.local.",
      );
    }

    const start = Date.now();
    log.info("searching", {
      query,
      maxResults,
      searchDepth,
      topic,
      includeAnswer,
    });

    let response: Response;
    try {
      response = await fetch(TAVILY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: maxResults,
          search_depth: searchDepth,
          topic,
          include_answer: includeAnswer,
        }),
      });
    } catch (err) {
      log.error("tavily fetch failed", {
        error: errFields(err),
        durationMs: Date.now() - start,
      });
      throw err;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      log.error("tavily non-2xx", {
        status: response.status,
        statusText: response.statusText,
        body: text.slice(0, 500),
        durationMs: Date.now() - start,
      });
      throw new Error(
        `Tavily returned ${response.status}: ${response.statusText}${text ? ` — ${text}` : ""}`,
      );
    }

    const data = (await response.json()) as {
      query: string;
      results?: Array<{
        title: string;
        url: string;
        content: string;
        score?: number;
      }>;
      answer?: string;
    };

    const results = data.results ?? [];
    log.info("search complete", {
      query,
      resultCount: results.length,
      hasAnswer: Boolean(data.answer),
      durationMs: Date.now() - start,
    });

    return {
      query: data.query,
      results: results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
      })),
      answer: data.answer ?? null,
    };
  },
});