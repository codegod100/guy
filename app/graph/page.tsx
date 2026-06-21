import type { Metadata } from "next";
import { MemoryGraphCanvas } from "@/app/graph/_components/memory-graph-canvas";

export const metadata: Metadata = {
  title: "Memory Graph · guy",
  description: "Visualize the Turso memory graph.",
};

export default function GraphPage() {
  return <MemoryGraphCanvas />;
}
