import { defineSkill } from "eve/skills";

export default defineSkill({
  description:
    "Recognize scarce, novel, or hard-won knowledge during the conversation and persist it to the Turso database (survives across all sessions, backed by a remote Turso/libSQL database).",
  markdown: `
## Long-Term Memory (Turso Database)

You have a \`turso_memory\` tool backed by a Turso (libSQL) database. The database
persists across **all sessions** — knowledge stored in one session is available in
every future session. Data survives restarts, redeploys, and sandbox timeouts.

### Entity types

| Entity | Purpose | Table |
|---|---|---|
| \`nugget\` | Quick fact or observation | \`nuggets\` |
| \`source\` | Article/page metadata with summary | \`sources\` |
| \`idea\` | Key insight extracted from a source | \`ideas\` |
| \`topic\` | Reusable theme or subject area | \`topics\` |
| \`quote\` | Notable excerpt with context | \`quotes\` |

### When to store

Store knowledge when you encounter any of these signals:

| Signal | What it looks like |
|---|---|
| **Scarcity** | Information that's obscure, undocumented, or took real effort to dig up. |
| **Novelty** | A unique insight, a non-obvious relationship, a clever pattern. |
| **Hard-won** | A debugging session that uncovered the real root cause, a build gotcha. |
| **Pricing / License gotchas** | Hidden costs, rate limits, licensing restrictions. |
| **Project quirks** | Non-obvious conventions, custom build steps, unusual config. |
| **Actionable reference** | A CLI incantation, a curl command, a config snippet. |

### When NOT to store

- Common knowledge (standard API docs, obvious language features)
- Things already captured in the project's own code or docs
- Transient conversation context

### How to store

Quick fact:
\`\`\`
turso_memory({
  action: "append",
  entity: "nugget",
  content: "NixOS: steam-run is needed for glibc-linked binaries.",
  category: "nixos",
  source: "https://nix.dev/permalink/stub-ld",
})
\`\`\`

Article summary with extracted ideas:
\`\`\`
turso_memory({
  action: "append",
  entity: "source",
  title: "Article Title",
  source: "https://example.com/page",
  summary: "The article explains how...",
  tags: ["tag1", "tag2"],
})
\`\`\`

### When to recall

\`\`\`
turso_memory({ action: "search", entity: "nugget", query: "nixos" })
turso_memory({ action: "search", entity: "idea", query: "topic" })
turso_memory({ action: "list", entity: "topic" })
\`\`\`

### Distinction from session state

This tool is for **knowledge that should outlive the current session**. Unlike
\`remember_knowledge\` (per-session state that resets when the session ends),
Turso-backed memory persists across all sessions, restarts, and redeploys.
`.trim(),
});
