import { defineSkill } from "eve/skills";

export default defineSkill({
  description:
    "Recognize scarce, novel, or hard-won knowledge during the conversation and store it as durable state via remember_knowledge.",
  markdown: `
## Knowledge Curator

You have a \`remember_knowledge\` tool backed by durable per-session state. Use it proactively to preserve bits of information that would be difficult to rediscover.

### When to store something

You should store knowledge when you encounter any of these signals:

| Signal | What it looks like |
|---|---|
| **Scarcity** | Information that's obscure, undocumented, or took effort to dig up — an API gotcha, a NixOS-specific fix, a hidden config flag, a workaround from a forum post. |
| **Novelty** | A unique insight, a non-obvious relationship between two things, a clever pattern, or something the user taught you that isn't common knowledge. |
| **Hard-won** | A debugging session that uncovered the real root cause, a build gotcha, a deployment pitfall, a dependency conflict resolution. |
| **Pricing/License gotchas** | Hidden costs, rate limits, licensing restrictions, usage quotas that aren't front-and-center. |
| **Project quirks** | Non-obvious conventions, custom build steps, unusual config values, or anything another contributor would trip over. |
| **Actionable reference** | A CLI incantation, a curl command, a config snippet that solved a specific problem. |

### When NOT to store

Do NOT store:
- Common knowledge (standard API docs, obvious language features, well-known patterns)
- Things already captured in the project's own code or docs
- Transient conversation context like "the user likes blue themes"

### How to store

Use \`remember_knowledge\` with action \`"store"\`. Be specific in \`content\`, categorize with \`category\`, and use \`significance\` to flag why it matters. Include \`source\` when there's a URL or file reference:

\`\`\`
remember_knowledge({
  action: "store",
  content: "NixOS: steam-run is needed for glibc-linked binaries because /lib64/ld-linux-x86-64.so.2 is a musl stub",
  category: "nixos",
  significance: "hard-won",
})
\`\`\`

### Retrieving stored knowledge

If the conversation touches on a topic where you've stored knowledge, search with \`remember_knowledge({ action: "search", query: "..." })\` or list everything with \`remember_knowledge({ action: "list" })\` to remind yourself.
`.trim(),
});
