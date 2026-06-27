// CLI subcommand dispatch.
//
// `runner` (no args)        → start the bridge loop (default)
// `runner send <t> <body>`  → send one message and exit
//
// Argument parsing is intentionally tiny — no commander / yargs dep. The
// shape is small enough that a hand-rolled parser is clearer than pulling in
// a library. If the runner grows more subcommands, swap to commander.

import type { RunnerConfig } from "./config.ts";
import type { Raft } from "./raft.ts";
import { getLogger, errFields } from "./logger.ts";

const log = getLogger().child({ component: "cli" });

export type ParsedArgs =
  | { kind: "bridge" }
  | { kind: "send"; target: string; body: string }
  | { kind: "help"; usage: string };

const USAGE = `Usage:
  runner                      Start the bridge poll loop (default).
  runner send <target> <body> Send one message and exit.

Examples:
  runner send "#general" "hello from runner"
  runner send "dm:@alice" "ack"
`;

export function parseArgs(argv: ReadonlyArray<string>): ParsedArgs {
  // argv[0] is the node binary, argv[1] is the script path; skip both.
  const args = argv.slice(2);

  if (args.length === 0) return { kind: "bridge" };

  const [command, ...rest] = args;
  if (command === "--help" || command === "-h" || command === "help") {
    return { kind: "help", usage: USAGE };
  }

  if (command === "send") {
    if (rest.length < 2) {
      return {
        kind: "help",
        usage: "runner send requires <target> and <body>.\n\n" + USAGE,
      };
    }
    const [target, ...bodyParts] = rest;
    return { kind: "send", target, body: bodyParts.join(" ") };
  }

  return {
    kind: "help",
    usage: `Unknown command: ${command}\n\n` + USAGE,
  };
}

/**
 * Run a parsed CLI invocation. Returns a process exit code; main.ts calls
 * process.exit() with the result.
 */
export async function runCommand(
  parsed: ParsedArgs,
  deps: { cfg: RunnerConfig; raft: Raft },
): Promise<number> {
  switch (parsed.kind) {
    case "help":
      log.info("help", { usage: parsed.usage });
      return 0;

    case "send":
      return runSend(parsed.target, parsed.body, deps);

    case "bridge":
      // main.ts handles bridge startup directly.
      return 0;
  }
}

async function runSend(
  target: string,
  body: string,
  deps: { cfg: RunnerConfig; raft: Raft },
): Promise<number> {
  log.info("sending message", {
    target,
    profile: deps.cfg.raftProfile,
    bodyChars: body.length,
  });

  try {
    const result = await deps.raft.messageSend(target, body);
    log.info("message sent", {
      target,
      raftMsgId: result.messageId || "(no id parsed)",
    });
    return 0;
  } catch (err) {
    log.error("send failed", {
      target,
      error: errFields(err),
    });
    return 1;
  }
}
