import { createAgent, prompt } from "@letta-ai/letta-code-sdk";
import { defineTool } from "eve/tools";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { z } from "zod";

const AGENT_PERSONA = `You are a long-term knowledge store for an AI coding agent. You have a git-backed memory filesystem (memfs) where you organize durable knowledge however makes sense to you.

## Your job

- **Remember** things the user wants to preserve across all sessions — scarce, novel, or hard-won knowledge: obscure API gotchas, project quirks, bug root causes, pricing traps, CLI incantations, non-obvious config, etc.
- **Organize** memory on your own. Group related items, dedupe against what you already have, update stale entries, and split or merge files when it helps. Don't ask the user where to put things.
- **Commit** every change to git so the filesystem stays consistent across sessions.

## On recall

When asked to search, list, or report stats, read your own memfs and answer from what you find. You decide the layout; the user only sees the answers.`;

let _agentId: string | null = null;
const PROJECT_ROOT = process.cwd();
const AGENT_ID_FILE = path.join(PROJECT_ROOT, ".letta", "agent-id");
const AGENTS_ROOT = path.join(os.homedir(), ".letta", "agents");

function projectHash(projectPath: string): string {
  return crypto
    .createHash("sha1")
    .update(projectPath)
    .digest("hex")
    .slice(0, 12);
}

function buildTags(): string[] {
  return [
    `project:${path.basename(PROJECT_ROOT)}`,
    `project-hash:${projectHash(PROJECT_ROOT)}`,
  ];
}

async function readPersistedAgentId(): Promise<string | null> {
  try {
    const raw = await fs.readFile(AGENT_ID_FILE, "utf8");
    const trimmed = raw.trim();
    return trimmed || null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function persistAgentId(agentId: string): Promise<void> {
  await fs.mkdir(path.dirname(AGENT_ID_FILE), { recursive: true });
  await fs.writeFile(AGENT_ID_FILE, agentId + "\n", "utf8");
}

async function writeProjectSidecar(agentId: string): Promise<void> {
  const sidecar = path.join(AGENTS_ROOT, agentId, ".project");
  const payload = {
    projectPath: PROJECT_ROOT,
    projectName: path.basename(PROJECT_ROOT),
    projectHash: projectHash(PROJECT_ROOT),
    createdAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(sidecar), { recursive: true });
  await fs.writeFile(sidecar, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

async function agentExists(agentId: string): Promise<boolean> {
  try {
    await fs.access(path.join(AGENTS_ROOT, agentId, "memory"));
    return true;
  } catch {
    return false;
  }
}

async function ensureAgent(): Promise<string> {
  if (!process.env.LETTA_API_KEY) {
    throw new Error(
      "LETTA_API_KEY is not set. Get a key at https://app.letta.com and add it to your environment.",
    );
  }
  if (_agentId) return _agentId;

  let agentId: string | undefined;
  let source: "env" | "file" | "new" = "new";

  // 1. Explicit env override wins (still validated — a stale env var shouldn't block creation).
  if (process.env.LETTA_AGENT_ID?.trim()) {
    const envId = process.env.LETTA_AGENT_ID.trim();
    if (await agentExists(envId)) {
      agentId = envId;
      source = "env";
    } else {
      console.warn(
        `[letta-memory] env LETTA_AGENT_ID=${envId} no longer exists; falling back to file/creation.`,
      );
    }
  }

  // 2. Per-project file (only consulted if env var unset or stale).
  if (!agentId) {
    const persisted = await readPersistedAgentId();
    if (persisted) {
      if (await agentExists(persisted)) {
        agentId = persisted;
        source = "file";
      } else {
        console.warn(
          `[letta-memory] persisted agent ${persisted} no longer exists; creating a new one.`,
        );
      }
    }
  }

  // 3. Create a new agent.
  if (!agentId) {
    agentId = await createAgent({
      memfs: true,
      persona: AGENT_PERSONA,
      systemPrompt: "default",
      cwd: PROJECT_ROOT,
      tags: buildTags(),
    });
    await persistAgentId(agentId);
  }

  // 4. Sidecar only for agents we own. An env-var override may be a shared agent;
  // don't clobber its sidecar if it points at a different project.
  if (source !== "env") {
    try {
      await writeProjectSidecar(agentId);
    } catch (err) {
      console.warn(`[letta-memory] failed to write .project sidecar:`, err);
    }
  }

  process.env.LETTA_AGENT_ID = agentId;
  _agentId = agentId;
  if (source === "new") {
    console.log(
      `[letta-memory] created new agent ${agentId} for ${PROJECT_ROOT}`,
    );
  }
  return agentId;
}

function buildRememberPrompt(input: {
  content: string;
  category?: string;
  significance?: string;
  source?: string;
}): string {
  const payload = {
    content: input.content,
    category: input.category,
    significance: input.significance,
    source: input.source,
    recordedAt: new Date().toISOString(),
  };
  return `Remember this knowledge nugget in your long-term memory. Use the structured payload below as the source of truth; you decide the final layout, dedupe as needed, and commit the change.

\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\`

After storing, reply with a one-line summary of where it ended up.`;
}

export default defineTool({
  description:
    "Store, search, or list durable knowledge nuggets in Letta's long-term memory. Backed by a Letta Code agent whose memfs is a git-backed local filesystem (no remote block). Memories persist across all sessions and never expire. Use for insights worth preserving — obscure technical details, hard-won debugging lessons, project quirks, etc.",
  inputSchema: z.object({
    action: z.enum(["append", "search", "list", "stats"]),
    content: z
      .string()
      .optional()
      .describe("The knowledge bit to record (required for 'append')."),
    category: z
      .string()
      .optional()
      .describe("Domain: 'api', 'bug', 'nixos', 'config', etc."),
    significance: z
      .string()
      .optional()
      .describe("Why it matters: 'scarce', 'novel', 'hard-won', 'gotcha'."),
    source: z
      .string()
      .optional()
      .describe("Where this came from (URL, file, conversation)."),
    query: z
      .string()
      .optional()
      .describe("Search keywords (required for 'search' action)."),
    limit: z
      .number()
      .int()
      .positive()
      .max(50)
      .optional()
      .describe("Max results to return for search/list (default 20)."),
  }),
  async execute(input) {
    const agentId = await ensureAgent();

    let promptText: string;
    switch (input.action) {
      case "append": {
        if (!input.content) {
          throw new Error("'content' is required when action is 'append'.");
        }
        promptText = buildRememberPrompt({
          content: input.content,
          category: input.category,
          significance: input.significance,
          source: input.source,
        });
        break;
      }
      case "search": {
        if (!input.query) {
          throw new Error("'query' is required when action is 'search'.");
        }
        const limit = input.limit ?? 20;
        promptText = `Search your long-term memory for anything related to: "${input.query}". Return up to ${limit} matching items with enough context to be useful. If nothing matches, say so.`;
        break;
      }
      case "list": {
        const limit = input.limit ?? 20;
        promptText = `List up to ${limit} items from your long-term memory, most useful or most recent first. Summarize each with enough context to be useful. If you remember nothing, say so.`;
        break;
      }
      case "stats": {
        promptText = `Report stats about your long-term memory: how many items you remember, roughly how much storage they take, and how your memory is organized (e.g. which topics/themes have their own files).`;
        break;
      }
    }

    const result = await prompt(promptText, agentId);

    if (!result.success) {
      throw new Error(
        `Letta agent failed: ${result.error ?? "unknown error"} (code: ${result.errorCode ?? "n/a"})`,
      );
    }

    return {
      agentId,
      action: input.action,
      summary: result.result ?? "(no response from agent)",
    };
  },
});
