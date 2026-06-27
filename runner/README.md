# runner

A long-running bridge between Raft (chat/task platform) and the eve agent.
The runner is itself the agent Raft talks to; it claims tasks, drives the eve
HTTP channel, and posts results back.

```
Raft server  ─CLI→  runner  ─HTTP(/eve/v1)→  eve agent
```

## Run

```bash
node --env-file-if-exists=.env --experimental-transform-types runner/src/main.ts
```

or, if you prefer npm:

```bash
npm run runner           # default: pretty colored logs, info level
npm run runner:debug     # verbose logs
npm run runner:json      # newline-delimited JSON (for log aggregators)
npm run runner:watch     # restart on file changes
```

### Subcommands

```bash
npm run runner              # default: start the bridge poll loop
npm run runner -- help      # show usage
npm run runner -- send "<target>" "<body>"   # one-shot message send, exits 0/1
```

Examples:

```bash
npm run runner -- send "#general" "runner online"
npm run runner -- send "dm:@alice" "ack"
```

The `send` subcommand is useful as a smoke test: if it posts and exits 0,
your raft credential and network reachability are both working. Anything
that fails exits 1 with a structured error log.

The runner runs under Node 22+ with `--experimental-transform-types`, which
strips TypeScript syntax at load time. No build step, no transpiler.

`.env` and `.env.local` are loaded via Node's `--env-file-if-exists` flag;
entries already in the shell environment take precedence over the files.
Loading both lets the runner pick up Turso creds from `.env.local` without
duplicating them in `.env`.

## Logging

The runner logs to stdout (info/debug) and stderr (warn/error) in a
human-readable format by default, with ANSI colors when stdout is a TTY.
Set `LOG_FORMAT=json` to get newline-delimited JSON for production log
pipelines. Set `LOG_LEVEL=debug` for verbose output.

Identical errors are deduplicated: the first occurrence logs normally, the
next 30 seconds stay silent, then a single "repeated N times" line is
emitted. This keeps the raft-binary-not-found or wrong-port-eve errors
from spamming once per poll interval.

| Var          | Default   | Purpose                                                    |
| ------------ | --------- | ---------------------------------------------------------- |
| `LOG_LEVEL`  | `info`    | `debug` / `info` / `warn` / `error`                        |
| `LOG_FORMAT` | `pretty`  | `pretty` (TTY-friendly) or `json` (NDJSON for aggregators) |
| `LOG_COLOR`  | auto      | `1` to force color, `0` to disable                         |

## Required env vars

| Var               | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `RAFT_SERVER`     | Raft server URL                                                      |
| `RAFT_PROFILE`    | Profile slug (passed as `--profile` to every raft call)              |
| `EVE_HOST`        | Base URL of the deployed eve agent (e.g. `https://guy.vercel.app`)   |
| `RUNNER_DB_URL`   | libsql URL for the durable seen-messages store. Falls back to `TURSO_DATABASE_URL`. Supports `libsql://...` (Turso) and `file:...` (local SQLite). |
| `EVE_AUTH_BEARER` | Optional. Bearer token for the eve channel (BYOK). Leave empty for loopback hosts using `localDev()`; required when the channel auth chain doesn't include `localDev()` (deployed, custom auth). |

## Optional env vars

| Var                          | Default                  | Purpose                                  |
| ---------------------------- | ------------------------ | ---------------------------------------- |
| `RUNNER_AGENT_HANDLE`        | `runner-<profile>`       | Stable Raft @handle for ack posts        |
| `RUNNER_POLL_INTERVAL_MS`    | `5000`                   | Poll interval                            |
| `RUNNER_TURN_TIMEOUT_MS`     | `300000`                 | Per-task eve turn timeout                |
| `RAFT_BIN`                   | `raft`                   | Raft CLI binary name (`slock` for legacy)|
| `RUNNER_DB_AUTH_TOKEN`       | (none)                   | libsql auth token. Falls back to `TURSO_AUTH_TOKEN`. Required for remote Turso URLs; not needed for local `file:` URLs. |

## Required CLI

The runner shells out to the `raft` CLI (legacy alias: `slock`). Install once
per host:

```bash
npm i -g @botiverse/raft@latest
```

Then log in to the Raft profile the runner will use:

```bash
raft agent login --server "$RAFT_SERVER" --agent <id> --profile-slug "$RAFT_PROFILE"
```

## v1 scope

Happy path only:

1. Poll Raft for new messages.
2. Claim the task (`raft task claim`) before doing anything.
3. Drive one eve turn via `Client.session().send(...)`.
4. Post a summary back to the task's thread.
5. Mark the task `in_review` (a human must approve → `done`).

Out of scope for v1: reminders, attachments, reactions, parallel subtask
splitting, multiple eve sessions per task.