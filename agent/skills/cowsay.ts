import { defineSkill } from "eve/skills";

export default defineSkill({
  description:
    "Use the cowsay tool to turn messages into ASCII-art speech bubbles. Always display the output back to the user.",
  markdown: `
## Cowsay

The \`cowsay\` tool wraps a message in a configurable ASCII-art speech bubble
with a cow or other character underneath.

### When to use it

Use \`cowsay\` when:
- The user asks for a fun or decorative rendering of a message
- You want to make a reply more playful or memorable
- The user mentions "cowsay", "cow say", "moo", or asks you to "cowify" something

### How to use it

Call \`cowsay\` with at least the \`text\` field:

\`\`\`json
cowsay({ text: "Hello, world!" })
\`\`\`

Optional parameters:
- \`character\` — pick a specific cow file from the list below
- \`random: true\` — pick a random character (overrides \`character\`)
- \`mode\` — preset face (\`"b"\`, \`"d"\`, \`"g"\`, \`"p"\`, \`"s"\`, \`"t"\`, \`"w"\`, \`"y"\`)
- \`eyes\` — custom eyes (e.g. \`"^^"\`, \`"xx"\`)
- \`tongue\` — custom tongue (e.g. \`"U "\`)
- \`think\` — use a think bubble instead of a speech bubble
- \`wrap\` — wrap text at a specific column width

### Available characters (190 total)

**Sci-fi / robots:** C3PO, R2-D2, atat, borg, dalek, dalek-shooting, kosh, robot, robotfindskitten, vader, vader-koala, weeping-angel

**Animals:** armadillo, bearface, bud-frogs, bunny, cat, cat2, catfence, charizardvice, cowfee, daemon, default, doge, dolphin, dragon, dragon-and-cow, elephant, elephant-in-snake, elephant2, fat-cow, flaming-sheep, fox, ghost, goat, goat2, golden-eagle, hand, happy-whale, hedgehog, hellokitty, hypno, ibm, jellyfish, kitten, kitty, koala, lamb, lamb2, lobster, luke-koala, meow, milk, minotaur, moofasa, mooghidjirah, moojira, moose, mule, mutilated, nyan, octopus, owl, pterodactyl, puppy, ren, seahorse, seahorse-big, sheep, shikato, skeleton, small, smiling-octopus, snoopy, snoopyhouse, snoopysleep, spidercow, squid, squirrel, stegosaurus, stimpy, sudowoodo, supermilker, surgery, tableflip, taxi, telebears, threader, threecubes, toaster, tortoise, turkey, turtle, tux, tux-big, tweety-bird, whale, www

**Food / objects:** banana, cake, cake-with-candles, cheese, cube, fat-banana, lightbulb, pinball-machine, toaster, wood, world

**Characters / people:** awesome-face, beavis.zen, bill-the-cat, bishop, charlie, chessmen, chito, claw-arm, clippy, cower, cthulhu-mini, ebi_furai, eyes, fence, fire, ghostbusters, glados, hippie, hiya, hiyoko, homer, iwashi, karl_marx, kilroy, king, kiss, knight, lollerskates, mailchimp, maze-runner, mech-and-cow, mona-lisa, okazu, pawn, personality-sphere, psychiatrichelp, psychiatrichelp2, queen, renge, roflcopter, rook, sachiko, satanic, shrug, snoopy, snoopyhouse, snoopysleep, yasuna_01, yasuna_02, yasuna_03, yasuna_03a, yasuna_04, yasuna_05, yasuna_06, yasuna_07, yasuna_08, yasuna_09, yasuna_10, yasuna_11, yasuna_12, yasuna_13, yasuna_14, yasuna_16, yasuna_17, yasuna_18, yasuna_19, yasuna_20, ymd_udon, zen-noh-milk

**Symbols / abstract:** aperture, aperture-blank, bees, biohazard, black-mesa, bong, box, broken-heart, companion-cube, docker-whale, explosion, eyes, fire, golden-eagle, ibm, king, kiss, milk, periodictable, radio, USA, wizard

**Default cow** (when no character is specified): \`"default"\`

### CRITICAL: Always show the output to the user

When you call \`cowsay\`, the tool returns an \`output\` field containing the
rendered ASCII art. You **must** include this output in your response to the
user, verbatim, inside a code block.

**Example of a correct response after calling cowsay:**

The tool call:
\`\`\`
cowsay({ text: "Hello, world!" })
\`\`\`

Your response to the user must include the output:
\`\`\`
 ______________
< Hello, world! >
 --------------
        \\   ^__^
         \\  (oo)\\_______
            (__)\\       )\\/\\
                ||----w |
                ||     ||
\`\`\`

**Rules:**
- Do NOT call cowsay and skip showing the result.
- Do NOT summarize or describe the output — present it verbatim in a code block.
- Do NOT embed the cow art inline without a code block — it will lose formatting.
- If you call cowsay, the output goes in your response. No exceptions.
`.trim(),
});
