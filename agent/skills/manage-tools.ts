import { defineSkill } from "eve/skills";

export default defineSkill({
  description:
    "Author, modify, debug, or remove eve tools. Use when the user asks to add a new capability to the agent, wire up a third-party API, fix a broken tool, or audit the existing tool surface.",
  markdown: `
## Manage eve tools

Tools are typed actions the agent can call. They live as one file per tool
under \`agent/tools/\` and are auto-discovered — the filename slug becomes
the tool name the model sees.

### File location and naming

- Path: \`agent/tools/<tool-name>.ts\`
- The filename slug is the runtime tool name. Use snake_case.
- One tool per file. The file's default export is the tool definition.
- After adding or renaming a file, restart \`eve dev\` (or \`eve start\`) so
  the framework picks it up.

### Minimal shape

\`\`\`ts
import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description:
    "What this tool does, written for the model — it routes on this text.",
  inputSchema: z.object({
    // Zod schema. Required even for no-arg tools: pass z.object({}).
    query: z.string().min(1).describe("..."),
  }),
  async execute(input, ctx) {
    // Return a JSON-serializable value.
    return { ok: true };
  },
});
\`\`\`

### Inputs

- \`description\` — short prose for the model. Drives routing; write the task
  that should trigger the call, not the implementation.
- \`inputSchema\` — Zod schema. \`describe()\` every field; the model reads
  these. For no inputs use \`z.object({})\`. Required.
- \`execute(input, ctx)\` — async or sync. May return structured data. Don't
  return secrets or unbounded content; filter upstream.
- \`outputSchema\` — optional Zod schema. Use when the shape is part of the
  contract and downstream tools/hooks rely on it.
- \`needsApproval\` — optional. Use \`always()\` / \`once()\` / \`never()\` from
  \`eve/tools/approval\` for sensitive operations (charges, sends, deletes).
- \`toModelOutput\` — optional. Project a rich return down to a small text
  summary when the model only needs the gist.

### Runtime context

\`ctx\` carries:

- \`ctx.session\` — auth, parent lineage, turn metadata.
- \`ctx.getSandbox()\` — live sandbox handle for filesystem/process work.
- \`ctx.getSkill(id)\` — read a packaged skill's files at runtime.

### Conventions

- Read API keys from \`process.env\` (e.g. \`TAVILY_API_KEY\`, \`TURSO_DATABASE_URL\`).
  Throw a clear error when unset; don't silently default to a placeholder.
- Match existing tool style: top-of-file import block, brief header comment
  only when the tool needs explanation. See \`get_markdown.ts\`,
  \`turso-memory.ts\`, \`web_search.ts\` for reference.
- Prefer \`fetch\` over new SDK deps when the REST API is small — keeps the
  surface lean and matches the no-deps pattern in this repo.
- For external HTTP calls, surface non-2xx responses with status + body so
  the model can act on them: \`throw new Error(\\\`X returned \\\${status}: ...\\\`)\`.

### Idempotency and durability

- eve replays recorded tool results. Make side effects idempotent, or
  gate them with \`needsApproval\`.
- Tools run in the app runtime with full access to \`process.env\` and
  shared \`lib/\` modules. They're not sandboxed.

### Modifying an existing tool

1. Read the current file in full before editing.
2. Keep the tool name stable unless the user wants a rename — renaming
   the file breaks any in-flight sessions that referenced it.
3. Bump the \`description\` only if the tool's surface meaningfully changed.
4. Restart \`eve dev\` after editing — hot reload picks up tools but a clean
   restart rules out stale state.

### Removing a tool

Delete the file under \`agent/tools/\` and restart \`eve dev\`. There's no
unregistration step.

### Debugging

- Set \`LOG_LEVEL=debug\` (or run \`npm run runner:debug\` for the runner)
  to see tool-call traffic.
- \`eve dev\`'s TUI shows tool calls inline; pass \`--tools full\` for the
  uncollapsed view.
- Throw informative errors with the upstream status code so model-side
  retries can decide whether to escalate.
`.trim(),
});