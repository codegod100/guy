import { defineSkill } from "eve/skills";

export default defineSkill({
  description:
    "Extract durable knowledge from the current session or conversation and persist the most valuable facts, ideas, topics, quotes, and source summaries into the Turso-backed memory store.",
  markdown: `
## Learn From Session

Use this skill when the conversation itself produced knowledge worth keeping beyond
this session: a root-cause discovery, a new pattern, a notable insight, a useful
reference, a project convention, or a distilled summary of something the user and
assistant figured out together.

### Goal

Turn the **current session** into durable memory by extracting only the highest-value
information and saving it with the \

turso_memory\
 tool.

### What counts as worth learning

Prefer storing information that is:
- **Hard-won** — the session uncovered a real root cause or non-obvious fix
- **Reusable** — likely to help in future sessions
- **Specific** — concrete enough to act on later
- **Novel** — not just generic background knowledge
- **Stable** — not temporary chit-chat or one-off state

Good examples:
- A deployment/debugging root cause
- A project-specific build or runtime quirk
- A precise command, configuration, or workflow that solved something
- A recurring design principle or system constraint
- A concise synthesis of a source or investigation from this session

Do **not** store:
- Greetings, filler, or transient planning
- Sensitive secrets, tokens, or private credentials
- Facts already obvious from standard documentation
- Raw conversation logs without distillation
- Temporary status updates that won't matter later

### Session learning workflow

1. **Review the current session mentally**
   - What did we learn?
   - What would be annoying to rediscover later?
   - What should survive beyond this conversation?

2. **Distill the session into structured memory**
   Choose the best entity type for each piece of knowledge:
   - \
	nugget\
: a compact fact, quirk, or gotcha
   - \
	topic\
: a reusable subject/theme that may collect related ideas
   - \
	idea\
: a key insight or explanation
   - \
	quote\
: a notable exact phrase worth preserving
   - \
	source\
: a synthesized summary of something learned from a page/article/source during the session

3. **Search before storing**
   Before appending a new topic or idea, search Turso memory to avoid near-duplicates.

   Example:
   \
\
\
   turso_memory({ action: "search", entity: "topic", query: "vercel deployment protection" })
   turso_memory({ action: "search", entity: "idea", query: "slack webhook blocked by vercel auth" })
   \
\
\

4. **Store the distilled knowledge**
   Save only the minimal, high-value representation.

### Recommended storage patterns

#### Store a debugging or workflow insight as a nugget
\
\
\

turso_memory({
  action: "append",
  entity: "nugget",
  content: "Vercel Authentication can block Slack webhooks on protected deployment URLs, so Slack callbacks need a public endpoint protected by Slack signature verification instead.",
  category: "vercel",
  source: "session",
})
\
\
\

#### Store a deeper lesson as an idea
\
\
\

turso_memory({
  action: "append",
  entity: "idea",
  content: "Human-facing deployment protection and machine-to-machine webhook authentication should be handled separately; Slack should rely on signature verification, not interactive deployment auth.",
  tags: ["vercel", "slack", "webhooks", "security"],
  importance: 5,
})
\
\
\

#### Store a reusable subject as a topic
\
\
\

turso_memory({
  action: "append",
  entity: "topic",
  name: "Vercel deployment protection",
  description: "How Vercel Authentication and deployment protection affect public routes, webhooks, and environment-specific access.",
  aliases: ["vercel auth", "deployment protection"],
})
\
\
\

#### Store a notable exact phrase as a quote
Only when the wording itself is useful.
\
\
\

turso_memory({
  action: "append",
  entity: "quote",
  text: "Vercel Authentication can protect humans, but Slack still needs a machine-accessible webhook.",
  context: "Session insight about separating deployment protection from webhook verification.",
  tags: ["vercel", "slack"],
})
\
\
\

### How to summarize a session before storing

When the session is broad, compress it first:
- one sentence for the root lesson
- 1-3 supporting facts
- a short list of tags/topics
- then store the distilled result, not the raw back-and-forth

### Output behavior

After learning from the session:
- briefly say what you stored
- mention the entity types or counts
- if nothing was worth storing, say so explicitly instead of forcing memory entries

Example:
- "Stored 1 nugget and 1 idea about Vercel deployment protection and Slack webhook routing."
- "Nothing durable stood out from this session, so I didn't add anything to long-term memory."

### Heuristic

Ask yourself:
**If I lost this session tomorrow, what would I most regret not remembering?**
Store that — and only that.
`.trim(),
});
