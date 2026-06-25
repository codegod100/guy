import { defineTool } from "eve/tools";
import { z } from "zod";
import { spawn } from "node:child_process";

const RAFT_BIN = "raft";
const RAFT_ENV = { ...process.env, RAFT_PROFILE: "guy" };
const RAFT_SERVER = "https://api.raft.build";
const TIMEOUT_MS = 30_000;

function raft(args: string[], stdin?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(RAFT_BIN, args, {
      env: RAFT_ENV,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`raft command timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`raft exited with code ${code}: ${stderr || stdout}`));
      }
    });

    if (stdin !== undefined) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

const targetSchema = z
  .string()
  .min(1)
  .describe(
    "Channel, DM, or thread target: '#channel', 'dm:@handle', or '#channel:shortid'.",
  );

export default defineTool({
  description:
    "Run a Raft CLI communication command. The raft CLI handles chat, tasks, reminders, attachments, and channel management for the agent.",
  inputSchema: z.object({
    action: z
      .enum([
        "message_check",
        "message_send",
        "message_read",
        "message_search",
        "message_resolve",
        "message_react",
        "task_list",
        "task_create",
        "task_claim",
        "task_unclaim",
        "task_update",
        "server_info",
        "channel_members",
        "channel_join",
        "channel_leave",
        "thread_unfollow",
        "reminder_schedule",
        "reminder_list",
        "reminder_cancel",
        "reminder_snooze",
        "attachment_upload",
        "attachment_view",
        "profile_show",
        "profile_update",
        "integration_list",
      ])
      .describe("Raft CLI action to execute."),
    // --- Message fields ---
    target: targetSchema.optional().describe(
      "Channel, DM, or thread target: '#channel', 'dm:@handle', or '#channel:shortid'. Required for message_send, channel_members, channel_join, channel_leave, thread_unfollow.",
    ),
    body: z.string().optional().describe(
      "Message body (for message_send). For drafts, omit body and set send_draft=true.",
    ),
    send_draft: z.boolean().optional().describe(
      "Set to true to send the current draft unchanged.",
    ),
    channel: z.string().optional().describe(
      "Channel, DM, or thread to operate on: '#channel', 'dm:@handle', or '#channel:shortid'. Required for message_read, task_*, channel_*.",
    ),
    before: z.string().optional().describe(
      "Message ID to read before (pagination anchor).",
    ),
    after: z.string().optional().describe(
      "Message ID to read after (pagination anchor).",
    ),
    around: z.string().optional().describe(
      "Message ID or integer to center the read window around.",
    ),
    query: z.string().optional().describe(
      "Search query string (for message_search).",
    ),
    message_id: z.string().optional().describe(
      "Message ID for resolve, react, claim, unclaim, or update.",
    ),
    message_ids: z.array(z.string()).optional().describe(
      "Message IDs to claim as tasks (for task_claim).",
    ),
    emoji: z.string().optional().describe(
      "Emoji reaction (for message_react).",
    ),
    remove: z.boolean().optional().describe(
      "Set to true to remove the reaction instead of adding it.",
    ),
    // --- Task fields ---
    titles: z.array(z.string()).optional().describe(
      "Task titles to create (for task_create).",
    ),
    numbers: z.array(z.number().int().positive()).optional().describe(
      "Task numbers to claim (for task_claim).",
    ),
    number: z.number().int().positive().optional().describe(
      "Task number to unclaim or update (for task_unclaim, task_update).",
    ),
    status: z.enum(["todo", "in_progress", "in_review", "done"]).optional().describe(
      "New task status (for task_update).",
    ),
    // --- Reminder fields ---
    title: z.string().optional().describe(
      "Reminder title (for reminder_schedule).",
    ),
    at: z.string().optional().describe(
      "ISO-8601 datetime when the reminder should fire.",
    ),
    in_: z.string().optional().describe(
      "Human duration (e.g. '30m', '2h'). Mutually exclusive with 'at'.",
    ),
    recurring: z.string().optional().describe(
      "Cron expression or human recurrence for repeating reminders.",
    ),
    id: z.string().optional().describe(
      "Reminder or attachment ID (for reminder_cancel, reminder_snooze, attachment_view).",
    ),
    duration: z.string().optional().describe(
      "Duration to snooze (e.g. '10m'). Defaults to server default.",
    ),
    // --- Attachment fields ---
    file_path: z.string().optional().describe(
      "Absolute path to the file to upload (for attachment_upload).",
    ),
    mime_type: z.string().optional().describe(
      "MIME type override. Auto-detected when omitted.",
    ),
    output: z.string().optional().describe(
      "Absolute path to save the downloaded file to (for attachment_view).",
    ),
    // --- Profile fields ---
    handle: z.string().optional().describe(
      "@handle to view (for profile_show). Omit to view your own profile.",
    ),
    display_name: z.string().optional().describe(
      "New display name (for profile_update).",
    ),
    avatar_file: z.string().optional().describe(
      "Absolute path to avatar image file (for profile_update).",
    ),
    avatar_url: z.string().optional().describe(
      "Avatar URL or pixel:random:<seed> for a pixel avatar (for profile_update).",
    ),
    // --- Legacy description fields (server_info, reminder_list, integration_list, + all actions) ---
    description: z.string().optional().describe(
      "Non-blocking check / listing description. Used by several read-only actions.",
    ),
  }),
  async execute(input) {
    const args: string[] = [];
    let stdin: string | undefined;

    switch (input.action) {
      // --- Messages ---
      case "message_check":
        args.push("message", "check");
        break;

      case "message_send": {
        args.push("message", "send", "--target", input.target!);
        if (input.send_draft) args.push("--send-draft");
        if (input.body) stdin = input.body;
        break;
      }

      case "message_read": {
        args.push("message", "read", "--channel", input.channel!);
        if (input.before) args.push("--before", input.before);
        else if (input.after) args.push("--after", input.after);
        else if (input.around) args.push("--around", input.around);
        break;
      }

      case "message_search":
        args.push("message", "search", "--query", input.query!);
        if (input.channel) args.push("--channel", input.channel);
        break;

      case "message_resolve":
        args.push("message", "resolve", input.message_id!);
        break;

      case "message_react":
        args.push("message", "react", "--message-id", input.message_id!, "--emoji", input.emoji!);
        if (input.remove) args.push("--remove");
        break;

      // --- Tasks ---
      case "task_list":
        args.push("task", "list", "--channel", input.channel!);
        break;

      case "task_create":
        args.push("task", "create", "--channel", input.channel!);
        for (const t of input.titles!) args.push("--title", t);
        break;

      case "task_claim": {
        args.push("task", "claim", "--channel", input.channel!);
        if (input.numbers) for (const n of input.numbers) args.push("--number", String(n));
        if (input.message_ids) for (const id of input.message_ids) args.push("--message-id", id);
        break;
      }

      case "task_unclaim":
        args.push("task", "unclaim", "--channel", input.channel!);
        if (input.number !== undefined) args.push("--number", String(input.number));
        if (input.message_id) args.push("--message-id", input.message_id);
        break;

      case "task_update":
        args.push("task", "update", "--channel", input.channel!, "--status", input.status!);
        if (input.number !== undefined) args.push("--number", String(input.number));
        if (input.message_id) args.push("--message-id", input.message_id);
        break;

      // --- Server & Channels ---
      case "server_info":
        args.push("server", "info", "--server", RAFT_SERVER);
        break;

      case "channel_members":
        args.push("channel", "members", "--target", input.target!);
        break;

      case "channel_join":
        args.push("channel", "join", "--target", input.target!);
        break;

      case "channel_leave":
        args.push("channel", "leave", "--target", input.target!);
        break;

      case "thread_unfollow":
        args.push("thread", "unfollow", "--target", input.target!);
        break;

      // --- Reminders ---
      case "reminder_schedule":
        args.push("reminder", "schedule", "--title", input.title!);
        if (input.at) args.push("--at", input.at);
        if (input.in_) args.push("--in", input.in_);
        if (input.recurring) args.push("--recurring", input.recurring);
        break;

      case "reminder_list":
        args.push("reminder", "list");
        break;

      case "reminder_cancel":
        args.push("reminder", "cancel", input.id!);
        break;

      case "reminder_snooze":
        args.push("reminder", "snooze", input.id!);
        if (input.duration) args.push("--duration", input.duration);
        break;

      // --- Attachments ---
      case "attachment_upload":
        args.push("attachment", "upload", input.file_path!);
        if (input.mime_type) args.push("--mime-type", input.mime_type);
        break;

      case "attachment_view":
        args.push("attachment", "view", input.id!);
        if (input.output) args.push("--output", input.output);
        break;

      // --- Profile ---
      case "profile_show":
        args.push("profile", "show");
        if (input.handle) args.push(input.handle);
        break;

      case "profile_update":
        args.push("profile", "update");
        if (input.display_name) args.push("--display-name", input.display_name);
        if (input.description) args.push("--description", input.description);
        if (input.avatar_file) args.push("--avatar-file", input.avatar_file);
        if (input.avatar_url) args.push("--avatar-url", input.avatar_url);
        break;

      // --- Integrations ---
      case "integration_list":
        args.push("integration", "list");
        break;
    }

    const { stdout, stderr } = await raft(args, stdin);

    return {
      action: input.action,
      stdout: stdout.trim(),
      stderr: stderr.trim() || undefined,
    };
  },
});
