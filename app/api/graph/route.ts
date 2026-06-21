import { NextResponse } from "next/server";
import { getMemoryGraphData } from "@/lib/memory-graph";

export async function GET(): Promise<Response> {
  try {
    const data = await getMemoryGraphData();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load memory graph.",
      },
      { status: 500 },
    );
  }
}
