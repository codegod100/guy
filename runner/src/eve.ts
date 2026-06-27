// Thin wrapper around eve/client's Client.
//
// One Client per process, bound to one eve host + auth combo. Per raft.md
// etiquette (ack → outline → progress → summary) the runner streams eve
// events and surfaces the right cadence to Raft.

import { Client, ClientError } from "eve/client";
import type { HandleMessageStreamEvent } from "eve/client";
import type { RunnerConfig } from "./config.ts";

export type EveTextProgress = {
  /** Aggregated assistant text from `message.appended` deltas. */
  text: string;
  /** Optional structured-output payload if the turn requested an output schema. */
  data: unknown;
  /** Final turn status. */
  status: "completed" | "failed" | "waiting";
  /** sessionId from the response — used for diagnostics. */
  sessionId: string;
};

export class Eve {
  private readonly client: Client;

  constructor(cfg: RunnerConfig) {
    this.client = new Client({
      host: cfg.eveHost,
      // Only attach a bearer when configured. Loopback eve hosts (localDev()
      // auth) accept requests with no Authorization header; attaching an empty
      // or missing bearer would fail that auth path.
      ...(cfg.eveAuthBearer ? { auth: { bearer: cfg.eveAuthBearer } } : {}),
    });
  }

  /**
   * Open a fresh conversation, send a message, stream the response, and
   * return the aggregated text + final status. Throws on eve-side errors.
   *
   * Per eve's MessageResponse contract: "Each response can only be consumed
   * once." We iterate via `for await...of` and accumulate text ourselves; we
   * do NOT also call `response.result()` afterwards.
   *
   * `clientContext` is an ephemeral hint for the next model call only
   * (per the eve client docs); we use it to inject Raft-side metadata
   * (channel, task number, requester handle, computed reply target) so the
   * eve-side harness can attribute its work and the `enqueue_raft_message`
   * tool knows where to post by default — without any of it leaking into
   * durable session history.
   */
  async send(
    message: string,
    clientContext: Record<string, string>,
  ): Promise<EveTextProgress> {
    let text = "";
    let data: unknown = undefined;
    let status: EveTextProgress["status"] = "waiting";
    let sessionId = "";

    try {
      const response = await this.client
        .session()
        .send({ message, clientContext });
      sessionId = response.sessionId;
      for await (const event of response) {
        const piece = consumeEvent(event);
        if (piece.textDelta) text += piece.textDelta;
        if (piece.finalData !== undefined) data = piece.finalData;
        if (piece.status) status = piece.status;
      }
      // If the stream ended without an explicit status event, treat it as
      // completed — the server closed the stream cleanly.
      if (status === "waiting" && text.length > 0) status = "completed";
      return {
        text,
        data,
        status,
        sessionId,
      };
    } catch (err) {
      if (err instanceof ClientError) {
        throw new Error(`eve client error: ${err.message}`);
      }
      throw err;
    }
  }

  /**
   * Liveness check used at startup. Throws if the eve agent isn't reachable.
   */
  async health(): Promise<void> {
    await this.client.health();
  }
}

type Consumed = {
  textDelta?: string;
  finalData?: unknown;
  status?: EveTextProgress["status"];
};

/**
 * Project a stream event into the runner's view of progress. We ignore most
 * events — we only need assistant text for the eventual summary, the
 * structured-output payload for diagnostics, and the final turn status.
 *
 * Per the eve protocol types:
 *   - `message.appended.data.messageDelta` — one text fragment
 *   - `result.completed.data.result`        — structured output, if any
 *   - `turn.completed` / `session.completed` — happy path
 *   - `turn.failed` / `session.failed`      — failure path
 *   - `session.waiting`                     — agent needs user input
 */
export function consumeEvent(event: HandleMessageStreamEvent): Consumed {
  switch (event.type) {
    case "message.appended":
      return { textDelta: event.data.messageDelta };
    case "result.completed":
      return { finalData: event.data.result };
    case "turn.completed":
    case "session.completed":
      return { status: "completed" };
    case "turn.failed":
    case "session.failed":
      return { status: "failed" };
    case "session.waiting":
      return { status: "waiting" };
    default:
      return {};
  }
}
