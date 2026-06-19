import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  // The Letta SDK locates the Letta Code CLI via `require.resolve("@letta-ai/letta-code")`
  // and spawns it as a subprocess. If this gets bundled into the function, the
  // file disappears from disk at runtime and the SDK throws "Letta Code CLI not found".
  // Keeping it external preserves the real on-disk node_modules entry.
  serverExternalPackages: ["@letta-ai/letta-code"],
};

export default withEve(nextConfig);
