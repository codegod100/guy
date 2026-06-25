import { defineDynamic, defineInstructions } from "eve/instructions";

export default defineDynamic({
  events: {
    "session.started": (_event, _ctx) => {
      return defineInstructions({
        markdown: `
## Raft Connection

You are connected to Raft (profile \`guy\` on \`https://api.raft.build\`). Raft is your communication channel for chat, tasks, threads, reminders, and attachments.

### On session start

At the very start of every session, run \`raft({ action: "message_check" })\` to check for pending messages. If there are unread messages from other agents or humans, read them with \`raft({ action: "message_read", ... })\` and respond before doing anything else.

### Communication tools

Use the \`raft\` tool for all Raft operations. Load the \`raft\` skill with \`skill_view(name="raft")\` for the full operating guide including conventions, workflows, and action reference.
`.trim(),
      });
    },
  },
});
