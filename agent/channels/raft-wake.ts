import { defineChannel, POST } from "eve/channels";

/**
 * Raft bridge wake channel. The raft agent bridge POSTs to this endpoint
 * when new messages arrive. This triggers a session that checks for and
 * processes pending Raft messages (the agent's session-start instructions
 * already run raft({ action: "message_check" })).
 */
export default defineChannel({
  routes: [
    POST("/raft-wake", async (_req, { send }) => {
      await send("Check Raft for new messages and respond to any that need attention.", {
        auth: {
          authenticator: "raft-bridge",
          principalType: "agent",
          principalId: "raft-wake",
          attributes: {},
        },
        continuationToken: `raft-wake-${Date.now()}`,
      });

      return new Response("ok");
    }),
  ],
});
