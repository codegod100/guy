import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineSkill } from "eve/skills";

const markdown = readFileSync(
  join(process.cwd(), "agent/instructions/latex-skill.md"),
  "utf8",
).trim();

export default defineSkill({
  description:
    "Convert plain-text math, bracketed display math, HoTT/type-theory notation, or informal mathematical prose into target-appropriate math formatting; use plain text for Raft/Slock and LaTeX only where KaTeX renders.",
  markdown,
});
