import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  knowledgeState,
  type KnowledgeNugget,
} from "../lib/knowledge-state.ts";

export default defineTool({
  description:
    "Store or retrieve scarce, novel, or hard-won knowledge bits discovered during the conversation. Use this to preserve insights that would be hard to rediscover — obscure technical details, project quirks, bug root causes, pricing gotchas, undocumented behavior, or anything that feels like a hidden gem.",
  inputSchema: z.object({
    action: z.enum(["store", "search", "list"]),
    content: z
      .string()
      .optional()
      .describe("The knowledge bit to store (required for 'store' action)."),
    category: z
      .string()
      .optional()
      .describe(
        "Domain: e.g. 'api', 'pricing', 'bug', 'config', 'workflow', 'nixos'.",
      ),
    significance: z
      .string()
      .optional()
      .describe(
        "Why this matters: 'scarce', 'novel', 'hard-won', 'gotcha', 'insight'.",
      ),
    query: z
      .string()
      .optional()
      .describe("Search keywords (required for 'search' action)."),
    source: z
      .string()
      .optional()
      .describe(
        "Where this knowledge came from (URL, file, conversation context).",
      ),
  }),
  async execute(input) {
    const state = knowledgeState;

    if (input.action === "list") {
      const nuggets = state.get().nuggets;
      if (nuggets.length === 0) {
        return { summary: "No knowledge nuggets stored yet." };
      }
      return {
        summary: `${nuggets.length} knowledge nugget(s) stored.`,
        nuggets: nuggets.map((n: KnowledgeNugget) => ({
          id: n.id,
          content: n.content,
          category: n.category,
          significance: n.significance,
          source: n.source,
        })),
      };
    }

    if (input.action === "search") {
      const q = (input.query ?? "").toLowerCase();
      const matches = state
        .get()
        .nuggets.filter(
          (n: KnowledgeNugget) =>
            n.content.toLowerCase().includes(q) ||
            n.category.toLowerCase().includes(q) ||
            (n.source ?? "").toLowerCase().includes(q),
        );
      if (matches.length === 0) {
        return { summary: `No nuggets match "${input.query}".` };
      }
      return {
        summary: `Found ${matches.length} matching nugget(s).`,
        nuggets: matches.map((n: KnowledgeNugget) => ({
          id: n.id,
          content: n.content,
          category: n.category,
          significance: n.significance,
          source: n.source,
        })),
      };
    }

    if (input.action === "store") {
      if (!input.content) {
        throw new Error("'content' is required when action is 'store'.");
      }

      const nugget: KnowledgeNugget = {
        id: `kn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        content: input.content,
        category: input.category ?? "general",
        significance: input.significance ?? "insight",
        recordedAt: new Date().toISOString(),
        source: input.source,
      };

      state.update((s) => ({
        ...s,
        nuggets: [...s.nuggets, nugget],
      }));

      return {
        summary: `Stored knowledge nugget "${nugget.id}".`,
        nugget: {
          id: nugget.id,
          content: nugget.content,
          category: nugget.category,
          significance: nugget.significance,
        },
      };
    }

    throw new Error(`Unknown action: ${input.action}`);
  },
});
