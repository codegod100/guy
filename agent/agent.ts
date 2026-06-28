import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineAgent } from "eve";
import { createOpenAICompatibleLanguageModelV4 } from "./lib/openai-compatible-language-model.ts";

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

//loadEnvLocal();

const cocore = createOpenAICompatibleLanguageModelV4({
  provider: "cocore",
  apiKey: process.env.COCORE_API_KEY,
  baseURL: "https://cocore.dev/api/v1",
});

// `maxTokens` is forwarded as `max_tokens` on every chat-completion request,
// telling the model to stop generating once it hits the budget. This is the
// primary lever for keeping replies short — capping on the runner side just
// truncates an already-long answer, but a token cap here forces the model
// to fit its answer inside the budget. Tune via env if a turn needs more
// room (some tool-call flows legitimately need it).
function readMaxTokens(fallback: number): number {
  const raw = process.env.EVE_MODEL_MAX_TOKENS?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const minimax = createOpenAICompatibleLanguageModelV4({
  provider: "minimax",
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: "https://api.minimax.io/v1",
  maxTokens: readMaxTokens(800),
});

const fugu = createOpenAICompatibleLanguageModelV4({
  provider: "fugu",
  apiKey: process.env.FUGU_API_KEY,
  baseURL: "https://api.sakana.ai/v1",
  maxTokens: readMaxTokens(800),
});

const MODEL = minimax("MiniMax-M3");
// const MODEL = fugu("fugu");

export default defineAgent({
  model: MODEL,
  modelContextWindowTokens: 10000,
});
