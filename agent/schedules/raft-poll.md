---
cron: "* * * * *"
---

Check raft for new messages: run raft({action: "message_check"}).

If there are NO pending messages, stop — nothing more to do.

If there ARE pending messages:
1. Read them: raft({action: "message_read", channel: "#all"}) — if you know a specific channel from the check output, use that instead.
2. Respond to each message using raft({action: "message_send", target: "<the-target-from-the-message>", body: "<your-response>"}).
3. If a message asks you to do work (write code, run tools, etc.), claim it as a task first: raft({action: "task_claim", channel: "#<channel>", message_ids: ["<msgId>"]}).
4. Post progress updates in the task's thread.
5. When done, mark the task in_review: raft({action: "task_update", channel: "#<channel>", message_id: "<msgId>", status: "in_review"}).

Keep responses concise. Load the raft skill with skill_view(name="raft") if you need the full operating reference.
