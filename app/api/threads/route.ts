import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/user";
import {
  getThreads,
  upsertThread,
  deleteThread,
} from "@/lib/threads-db";

/**
 * List threads for the current user.
 */
export async function GET(request: Request): Promise<Response> {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const threads = await getThreads(userId);
    return NextResponse.json({ ok: true, threads });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load threads.",
      },
      { status: 500 },
    );
  }
}

/**
 * Upsert a thread record.
 *
 * Body shape (JSON):
 *   { id, initialMessage, sessionId?, continuationToken?, streamIndex? }
 */
export async function POST(request: Request): Promise<Response> {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;

    const id = String(body.id ?? "");
    const initialMessage = String(body.initialMessage ?? "");

    if (!id || !initialMessage) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: id, initialMessage" },
        { status: 400 },
      );
    }

    await upsertThread({
      id,
      userId,
      initialMessage,
      sessionId: body.sessionId ? String(body.sessionId) : null,
      continuationToken: body.continuationToken
        ? String(body.continuationToken)
        : null,
      streamIndex: Number(body.streamIndex ?? 0),
      updatedAt: body.updatedAt ? String(body.updatedAt) : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to save thread.",
      },
      { status: 500 },
    );
  }
}

/**
 * Delete a thread by ?id=...
 */
export async function DELETE(request: Request): Promise<Response> {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing query param: id" },
        { status: 400 },
      );
    }

    await deleteThread(id, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete thread.",
      },
      { status: 500 },
    );
  }
}
