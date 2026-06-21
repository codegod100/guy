import { defineTool } from "eve/tools";
import { z } from "zod";
// Vendored copy of https://github.com/piuccio/cowsay (master @ 2024-01-25) at
// agent/lib/cowsay/. The library is converted to ESM in place so Rolldown can
// inline it; the original is CJS upstream.
import { say, think, listSync } from "../lib/cowsay/index.js";

const MODE_KEYS = [
  "b", // borg
  "d", // dead
  "g", // greedy
  "p", // paranoia
  "s", // stoned
  "t", // tired
  "w", // wired
  "y", // youthful
] as const;

export default defineTool({
  description:
    "Wrap a message in a configurable ASCII-art speech bubble with a cow (or other character) underneath. Useful for making tool results and chat replies more fun. Backed by the vendored https://github.com/piuccio/cowsay library in agent/lib/cowsay.",
  inputSchema: z.object({
    text: z.string().min(1).describe("The message for the character to say."),
    mode: z
      .enum(MODE_KEYS)
      .optional()
      .describe(
        "Preset face: b=borg, d=dead, g=greedy, p=paranoia, s=stoned, t=tired, w=wired, y=youthful. Mutually exclusive with custom eyes/tongue.",
      ),
    eyes: z
      .string()
      .max(8)
      .optional()
      .describe("Custom eyes (e.g. '^^', 'xx'). 1-2 chars recommended."),
    tongue: z
      .string()
      .max(8)
      .optional()
      .describe("Custom tongue (e.g. 'U '). 1-2 chars recommended."),
    character: z
      .string()
      .optional()
      .describe(
        "Name of the cow file from cowsay's cows/ directory (e.g. 'tux', 'dragon', 'elephant'). Omit for the default cow. Use the 'list' action to see all available characters.",
      ),
    random: z
      .boolean()
      .optional()
      .describe(
        "If true, pick a random character. Overrides 'character' when set.",
      ),
    think: z
      .boolean()
      .optional()
      .describe("Use a think bubble (parentheses) instead of a speech bubble."),
    wrap: z
      .number()
      .int()
      .positive()
      .max(120)
      .optional()
      .describe("Wrap the message at this column width."),
  }),
  async execute(input) {
    const options: Record<string, unknown> = { text: input.text };
    if (input.mode) options[input.mode] = true;
    if (input.eyes !== undefined) options.e = input.eyes;
    if (input.tongue !== undefined) options.T = input.tongue;
    if (input.random) options.r = true;
    else if (input.character) options.f = input.character;
    if (input.wrap !== undefined) options.W = input.wrap;

    const output = input.think ? think(options) : say(options);

    return {
      character: input.random ? "(random)" : (input.character ?? "default"),
      mode: input.mode ?? "custom",
      output,
    };
  },
});

export const _cowsayList = (): string[] => listSync();
