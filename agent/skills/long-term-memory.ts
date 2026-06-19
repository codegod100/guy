import { defineSkill } from "eve/skills";

export default defineSkill({
  description:
    "Recognize scarce, novel, or hard-won knowledge during the conversation and persist it to Letta's long-term memory (survives across all sessions, stored as files in a local git repo).",
  markdown: `
## Long-Term Memory (Letta, file-based)

You have a \`letta_memory\` tool backed by a Letta Code agent whose **memfs** is a git-backed local filesystem (no remote block). The agent owns its memory and decides how to organize it — which files to create, how to group items, when to dedupe or update. You just call the tool; the agent handles storage, formatting, and git commits. Memories persist across all sessions and survive restarts.

### When to store

Store a nugget when you encounter any of these signals:

| Signal | What it looks like |
|---|---|
| **Scarcity** | Information that's obscure, undocumented, or took real effort to dig up — an API gotcha, a NixOS-specific fix, a hidden config flag, a workaround from a forum post. |
| **Novelty** | A unique insight, a non-obvious relationship between two things, a clever pattern, or something the user taught you that isn't common knowledge. |
| **Hard-won** | A debugging session that uncovered the real root cause, a build gotcha, a deployment pitfall, a dependency conflict resolution. |
| **Pricing / License gotchas** | Hidden costs, rate limits, licensing restrictions, usage quotas that aren't front-and-center. |
| **Project quirks** | Non-obvious conventions, custom build steps, unusual config values, or anything another contributor would trip over. |
| **Actionable reference** | A CLI incantation, a curl command, a config snippet that solved a specific problem. |

### When NOT to store

- Common knowledge (standard API docs, obvious language features, well-known patterns)
- Things already captured in the project's own code or docs
- Transient conversation context like "the user likes blue themes"

### How to store

Call \`letta_memory\` with action \`"append"\`. Be specific in \`content\`; pass \`category\`, \`significance\`, and \`source\` as hints if you have them, but the agent decides the final layout. The agent will format, file, dedupe, and commit:

\`\`\`
letta_memory({
  action: "append",
  content: "NixOS: steam-run is needed for glibc-linked binaries because /lib64/ld-linux-x86-64.so.2 is a musl stub",
  category: "nixos",
  significance: "hard-won",
  source: "https://nix.dev/permalink/stub-ld",
})
\`\`\`

### When to recall

Before starting work on a topic, search your long-term memory:

\`\`\`
letta_memory({ action: "search", query: "nixos" })
\`\`\`

Or list everything to scan the full history:

\`\`\`
letta_memory({ action: "list", limit: 10 })
\`\`\`

### Distinction from session state

This tool is for **long-term knowledge** that should outlive the current session. For short-term working memory that lives and dies with the session (counters, current plan, the immediate task), use \`remember_knowledge\` (per-session durable state) or \`defineState\` from \`eve/context\`. The two are complementary.

### Storage details

- A dedicated Letta Code agent is created automatically on first use (with \`memfs: true\`); the agent ID is cached in \`LETTA_AGENT_ID\`.
- Memory lives in a git-backed local filesystem under \`~/.letta/agents/<agentId>/memory/\`. The agent decides the file layout, names, and grouping.
- Use \`letta_memory({ action: "stats" })\` to see the agent ID and a stats report.
- Because the agent mediates every op, each call pays a model roundtrip — prefer batched reads (\`list\` with a \`limit\`) over many small \`search\` calls.
`.trim(),
});
