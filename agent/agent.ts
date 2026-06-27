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

const minimax = createOpenAICompatibleLanguageModelV4({
  provider: "minimax",
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: "https://api.minimax.io/v1",
});

const MODEL = minimax("MiniMax-M3");

export default defineAgent({
  model: MODEL,
  modelContextWindowTokens: 131072,
});
