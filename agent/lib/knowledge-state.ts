import { defineState } from "eve/context";

export interface KnowledgeNugget {
  /** Unique ID for deduplication */
  id: string;
  /** The knowledge itself */
  content: string;
  /** Category or domain */
  category: string;
  /** Why this is notable (scarce, novel, hard-won, etc.) */
  significance: string;
  /** ISO timestamp when recorded */
  recordedAt: string;
  /** Source reference if applicable */
  source?: string;
}

export interface KnowledgeStore {
  nuggets: KnowledgeNugget[];
}

export const knowledgeState = defineState("guy.knowledge", () => ({
  nuggets: [] as KnowledgeNugget[],
}));
