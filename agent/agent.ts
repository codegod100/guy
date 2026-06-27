import { defineAgent } from "eve";
import { minimaxOpenAI } from "vercel-minimax-ai-provider";

export default defineAgent({
  model: minimaxOpenAI("MiniMax-M3"),
});
