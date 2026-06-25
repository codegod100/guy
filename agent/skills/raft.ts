import { defineSkill } from "eve/skills";

export default defineSkill({
  description:
    "Use the raft tool to communicate via Raft chat: check/send/read/search messages, manage tasks (list, claim, update), discover channels and members, schedule reminders, and upload/view attachments.",
  markdown: `
## Raft Communication

The \`raft\` tool wraps the Raft CLI for all chat, task, and attachment operations. Every command runs with profile \`guy\` against \`https://api.raft.build\`.

### Core conventions

- **Claim before working**: If a message asks you to take action (run tools, write code, make changes), claim it first with \`task_claim\` before starting. If the claim fails, someone else is working on it — move on.
- **Reply in context**: Always reuse the exact target from a received message so your reply goes to the right place — channel, DM, or thread.
- **Threads**: Append \`:shortid\` to the channel name (e.g. \`#general:00000000\`). When you receive a threaded message, reply with that same target. Threads cannot be nested.
- **Task status flow**: \`todo\` → \`in_progress\` → \`in_review\` → \`done\`
- **Never paste credentials** into public channels. Profile credentials are in \`~/.slock/profiles/guy/credential.json\`.
- **Historical references**: When someone refers to prior Raft discussion, use \`message_search\` and \`message_read\` to find the original context before answering.

### Actions reference

#### Messages

| Action | When to use |
|--------|------------|
| \`message_check\` | Non-blocking check for new messages. Use at natural breakpoints or after notifications. |
| \`message_send\` | Send a message to a channel (\`#channel\`), DM (\`dm:@handle\`), or thread (\`#channel:shortid\`). Pass \`body\` for the message text; set \`send_draft: true\` (and omit body) to send an existing draft unchanged. |
| \`message_read\` | Read past messages from a channel, DM, or thread. Use \`around\` for centered context around a specific message. Use \`before\` or \`after\` for pagination. |
| \`message_search\` | Search messages visible to you. Follow up with \`message_read\` to inspect a hit. |
| \`message_resolve\` | Verify a cited message ID exists and get its canonical row. Use for proof, not context. |
| \`message_react\` | Add or remove a reaction on a message. Use sparingly — prefer 👀 for acknowledgement. |

#### Tasks

| Action | When to use |
|--------|------------|
| \`task_list\` | View a channel's task board. |
| \`task_create\` | Create new task-messages in a channel (batch titles). This creates but does NOT claim — you must \`task_claim\` afterward. Only create genuinely new subtasks or follow-ups that don't already exist as tasks. |
| \`task_claim\` | Claim tasks by number (\`numbers\`) or message ID (\`message_ids\`). Use repeatable flags — both arrays can be set. Claim before doing any work. |
| \`task_unclaim\` | Release your claim on a task. |
| \`task_update\` | Change a task's status to \`in_review\` (for human validation) or \`done\` (after approval). |

**Workflow**: Receive a message requiring action → claim it → post updates in the task's thread → set status to \`in_review\` → after human approval, set to \`done\`.

#### Server & Channels

| Action | When to use |
|--------|------------|
| \`server_info\` | List all channels (joined status), members, and agents on the server. |
| \`channel_members\` | List members of a specific channel, DM, or thread. |
| \`channel_join\` | Join a visible public channel you're not yet a member of. |
| \`channel_leave\` | Leave a channel you've joined. |
| \`thread_unfollow\` | Stop receiving ordinary delivery for a thread. Only do this when work in that thread is clearly complete. |

#### Reminders

| Action | When to use |
|--------|------------|
| \`reminder_schedule\` | Schedule a reminder for yourself later. Use \`at\` (ISO-8601 datetime) or \`in_\` (human duration like '30m', '2h'). Set \`recurring\` for repeating reminders (cron expression). |
| \`reminder_list\` | List your reminders with lifecycle history. |
| \`reminder_snooze\` | Push a reminder later without replacing it. |
| \`reminder_cancel\` | Cancel a reminder by ID. |

Use reminders for follow-up that depends on future state you cannot resolve now. They are persistent, snoozable, and cancelable.

#### Attachments

| Action | When to use |
|--------|------------|
| \`attachment_upload\` | Upload a file from \`file_path\`. Returns an attachment ID to pass to \`message_send\`. Set \`mime_type\` only when you know the exact type. |
| \`attachment_view\` | Download and inspect a file by its attachment ID. Set \`output\` to save to a specific path. |

#### Profile & Integrations

| Action | When to use |
|--------|------------|
| \`profile_show\` | View your own profile or another via \`handle\` (e.g. \`@alice\`). |
| \`profile_update\` | Update your display name, description, or avatar. |
| \`integration_list\` | List built-in Slock apps and registered third-party services. |

### Error codes

The tool returns \`stderr\` on failure. Error code prefixes:
- \`MISSING_*\` / \`TOKEN_*\` — local auth bootstrap issues
- \`*_FAILED\` — 4xx from server
- \`SERVER_5XX\` — server unreachable or crashed

### Channel awareness

- Each channel has a name and optionally a description defining its purpose (visible via \`server_info\`).
- **Stay on topic**: post results and updates in the channel most relevant to the work.
- **Respect ongoing conversations**: only join if explicitly @mentioned or clearly addressed.
- If unsure where something belongs, run \`server_info\` to review channel descriptions.
`.trim(),
});
