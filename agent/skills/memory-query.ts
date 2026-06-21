import { defineSkill } from "eve/skills";

export default defineSkill({
  description:
    "Search, browse, and cross-reference the Turso-backed memory store to answer questions from previously summarized articles and stored knowledge.",
  markdown: `
## Memory Query

You have a \`turso_memory\` tool that stores structured knowledge across entity
types in a Turso (libSQL) database. When a question touches on topics you may have
researched before, query memory before answering from scratch.

### How to query memory

**Search across all entity types** — when you don't know where something lives:
\`\`\`
turso_memory({ action: "search", entity: "idea", query: "neural networks" })
turso_memory({ action: "search", entity: "topic", query: "deep learning" })
turso_memory({ action: "search", entity: "nugget", query: "performance" })
\`\`\`

**Browse what you know** — get the lay of the land:
\`\`\`
turso_memory({ action: "list", entity: "topic", limit: 20 })
turso_memory({ action: "list", entity: "source", limit: 10 })
turso_memory({ action: "list", entity: "idea", limit: 10 })
\`\`\`

**Get stats** — see how much stored knowledge exists:
\`\`\`
turso_memory({ action: "stats", entity: "idea" })
turso_memory({ action: "stats", entity: "source" })
\`\`\`

### Cross-referencing

When you find a relevant entity, trace its connections:

1. **Idea → Source** — If an idea has a \`sourceId\`, search for that source:
\`\`\`
turso_memory({ action: "search", entity: "source", query: "<sourceId>" })
\`\`\`

2. **Source → Ideas** — Find all ideas extracted from a source by searching the source URL or title:
\`\`\`
turso_memory({ action: "search", entity: "idea", query: "article title keywords" })
\`\`\`

3. **Topic → Ideas** — Find ideas tagged with a topic:
\`\`\`
turso_memory({ action: "search", entity: "idea", query: "topic name" })
\`\`\`

### Answering from memory

When asked a question, follow this workflow:

1. **Search memory** — Query across relevant entity types for the topic.
2. **Read the source** — If you find matching ideas, also grab their source summaries for context.
3. **Synthesize** — Combine what's in memory with the question to produce a grounded answer.
4. **Cite** — Mention which sources the answer draws from (source title and URL).

Example:
\`\`\`
# Step 1: Search
turso_memory({ action: "search", entity: "topic", query: "transformer architecture" })
turso_memory({ action: "search", entity: "idea", query: "transformer attention" })

# Step 2: If found, get source context
turso_memory({ action: "search", entity: "source", query: "src-<id>" })
\`\`\`

### When to load this skill

Load this skill when the user asks a question that:
- References a topic you've read about before
- Asks "what do you know about X?"
- Wants a synthesis of multiple stored sources
- Asks for a summary of your stored knowledge on a subject

### Combination with Summarize

When the user asks you to research something new:
1. First query memory to see what you already know.
2. Identify gaps.
3. If needed, load the \`Summarize\` skill to fetch new sources.
4. Store new findings with \`turso_memory\`.
`.trim(),
});
