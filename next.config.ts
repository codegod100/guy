import type { NextConfig } from "next";
import { resolve } from "node:path";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  // The Letta SDK locates the Letta Code CLI via `require.resolve("@letta-ai/letta-code")`
  // and spawns it as a subprocess. If this gets bundled into the function, the
  // file disappears from disk at runtime and the SDK throws "Letta Code CLI not found".
  // Keeping it external preserves the real on-disk node_modules entry.
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["@letta-ai/letta-code"],
  turbopack: {
    // Keep Turbopack scoped to this repo instead of the parent home directory.
    root: process.cwd(),
    // Turbopack respects .gitignore for file watching. These dirs
    // accumulate 40k+ files from eve runtime and can peg CPU/mem.
    memoryLimit: 4096,
  },
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias ??= {};
    config.resolve.alias["@"] = resolve(process.cwd());
    return config;
  },
};

export default withEve(nextConfig);
