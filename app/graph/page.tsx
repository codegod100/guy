import type { Metadata } from "next";
import { MemoryGraphPageClient } from "@/app/graph/_components/memory-graph-page-client";

export const metadata: Metadata = {
  title: "Memory Graph · guy",
  description: "Visualize the Turso memory graph.",
};

export default function GraphPage() {
  return <MemoryGraphPageClient />;
}
