import { defineSkill } from "eve/skills";

export default defineSkill({
  description:
    "Summarize the content of a URL by fetching it as Markdown and producing a concise summary, then store the extracted knowledge into the Turso-backed memory store.",
  markdown: `
## Summarize

When asked to summarize a URL, follow this workflow:

### Step 1: Fetch the content

Use the \`get_markdown\` tool with the target URL to retrieve the page as clean Markdown.

### Step 2: Read & distill

Analyze the returned Markdown and produce a **concise summary** that captures:
- The main topic or purpose of the page
- Key points, arguments, or findings (prioritize the most important 3-5)
- Any actionable conclusions or next steps, if present

### Step 3: Store structured knowledge

After summarizing, persist what you learned into the Turso-backed memory store
using \`turso_memory\` with entity types. This lets knowledge accrete across
multiple article summaries.

**Store the source** — always do this first:
\`\`\`
turso_memory({
  action: "append",
  entity: "source",
  title: "Article title",
  source: "https://example.com/article",
  author: "Author name (if known)",
  summary: "A short 1-3 sentence summary of the whole article",
  tags: ["tag1", "tag2", "tag3"],
})
\`\`\`

**Store key ideas** — one call per important idea or insight:
\`\`\`
turso_memory({
  action: "append",
  entity: "idea",
  content: "The key insight or argument extracted from the article",
  tags: ["related-topic"],
  importance: 4,  // 1-5 scale
  sourceId: "src-<ID from the source store call above>",
})
\`\`\`

**Track topics** — store or reference any high-level themes:
\`\`\`
turso_memory({
  action: "append",
  entity: "topic",
  name: "Topic Name",
  description: "Brief description of the topic",
  aliases: ["alternative-name", "abbreviation"],
})
\`\`\`

**Store notable quotes** — for compelling excerpts:
\`\`\`
turso_memory({
  action: "append",
  entity: "quote",
  text: "The exact quoted text",
  sourceId: "src-<ID from the source store call>",
  context: "The surrounding paragraph or section for context",
  tags: ["tag"],
})
\`\`\`

### Before storing, search for duplicates

Before storing a new idea or topic, search existing memory to avoid duplicates:
\`\`\`
turso_memory({
  action: "search",
  entity: "topic",
  query: "topic name",
})
\`\`\`

If the topic already exists, reference its ID rather than creating a new one.

### Format the final output

After the summary, provide a clear response:
- Start with a one-sentence TL;DR
- Follow with bullet points for key takeaways
- Keep the entire summary under 300 words unless the user asks for more detail
- Mention what was stored into memory (entity IDs, counts)

If the page is very long or the user wants a more detailed summary, mention that
you can be asked for deeper coverage of specific sections.
`.trim(),
});
