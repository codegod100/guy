import { defineAgent } from "eve";
import { deepseek } from "@ai-sdk/deepseek";

export default defineAgent({
  model: deepseek("deepseek-v4-pro"),
  // The Letta SDK spawns `@letta-ai/letta-code/letta.js` as a subprocess, so it
  // must exist on disk in the deployed function. Nitro rolls it into the
  // function bundle by default; externalizing it here makes Vercel ship it
  // under `/var/task/node_modules/@letta-ai/letta-code/letta.js`, which
  // `locateCli()` then finds via its walk-up from `process.cwd()`.
  build: {
    externalDependencies: ["@letta-ai/letta-code"],
  },
});
