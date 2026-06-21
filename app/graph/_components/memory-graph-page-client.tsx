"use client";

import dynamic from "next/dynamic";

const MemoryGraphCanvas = dynamic(
  () =>
    import("@/app/graph/_components/memory-graph-canvas").then(
      (module) => module.MemoryGraphCanvas,
    ),
  { ssr: false },
);

export function MemoryGraphPageClient() {
  return <MemoryGraphCanvas />;
}
