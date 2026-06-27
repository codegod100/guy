// Entrypoint: load config, parse CLI args, dispatch.
//
// Run with:
//   npm run runner              → start the bridge poll loop
//   npm run runner send <t> <body> → send one message and exit
//
// Logging: see runner/src/logger.ts. Defaults to pretty/cyan on a TTY,
// JSON when stdout is piped or LOG_FORMAT=json. Set LOG_LEVEL=debug for
// verbose output.

import { loadConfig } from "./config.ts";
import { Raft } from "./raft.ts";
import { Eve } from "./eve.ts";
import { Bridge } from "./bridge.ts";
import { MessageStore } from "./store.ts";
import { parseArgs, runCommand } from "./cli.ts";
import { getLogger, errFields } from "./logger.ts";

// .env loading is handled by the `node --env-file-if-exists=.env` (and
// `--env-file-if-exists=.env.local`) flags in the npm script. Real env vars
// win over the file (Node preserves already-set process.env entries).

const log = getLogger().child({ component: "main" });

async function main(): Promise<void> {
  const cfg = loadConfig();
  const parsed = parseArgs(process.argv);

  // Surface the resolved config whenever we're starting a bridge. Skip it for
  // one-shot subcommands like `send` so their output is just the action.
  if (parsed.kind === "bridge") {
    log.info("runner starting", {
      raftServer: cfg.raftServer,
      raftProfile: cfg.raftProfile,
      raftHandle: cfg.raftHandle,
      raftBin: cfg.raftBin,
      eveHost: cfg.eveHost,
      pollIntervalMs: cfg.pollIntervalMs,
      turnTimeoutMs: cfg.turnTimeoutMs,
      dbUrl: cfg.dbUrl,
      logLevel: process.env.LOG_LEVEL ?? "info",
      logFormat: process.env.LOG_FORMAT ?? "pretty",
    });
  }

  const raft = new Raft(cfg);

  // One-shot commands don't need the durable store — they don't process
  // messages. Skip the libsql round-trip so `send` is fast and doesn't
  // fail just because the DB is unreachable.
  if (parsed.kind !== "bridge") {
    const exitCode = await runCommand(parsed, { cfg, raft });
    process.exit(exitCode);
  }

  // Default: start the bridge. Open the store first; if libsql can't reach
  // the configured URL we want to fail fast at startup rather than silently
  // fall back to an in-memory dedup (which would re-process everything on
  // the next restart).
  const store = await MessageStore.open(cfg.dbUrl, cfg.dbAuthToken);
  const eve = new Eve(cfg);
  const bridge = new Bridge(cfg, raft, eve, store);

  // Liveness check before entering the loop — surface a clear warning if eve
  // is unreachable so the user knows to start it. The bridge continues; once
  // eve comes up, the next turn will succeed without a runner restart.
  try {
    await eve.health();
    log.info("eve health ok", { host: cfg.eveHost });
  } catch (err) {
    log.warn("eve health check failed; will retry on each turn", {
      host: cfg.eveHost,
      error: errFields(err),
    });
  }

  // Hard exit on SIGINT / SIGTERM. A graceful drain isn't useful here:
  // the await chain is held open by the active raft subprocess or eve
  // stream, and waiting for it can make Ctrl+C feel unresponsive. Kill
  // any in-flight raft CLI children so they don't outlive the runner.
  const stop = (signal: NodeJS.Signals, code: number) => {
    log.info(`received ${signal}; exiting`);
    raft.killActive();
    // Best-effort close: libsql will also close on process exit. We don't
    // block on it so Ctrl+C feels responsive.
    void store.close();
    process.exit(code);
  };
  process.on("SIGINT", () => stop("SIGINT", 130));
  process.on("SIGTERM", () => stop("SIGTERM", 143));

  await bridge.start();
  await store.close();
  log.info("runner stopped");
}

main().catch((err) => {
  log.error("runner crashed", { error: errFields(err, true) });
  process.exit(1);
});
