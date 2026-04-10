import { NextResponse } from "next/server";
import { eq, isNull, and } from "drizzle-orm";

import { db } from "~/server/db";
import { apiKeys } from "~/server/db/schema";
import { getSessionFromRequest } from "~/server/auth/helpers";
import { generateApiKey } from "~/server/auth/api-key-utils";

/**
 * GET /api/auth/api-keys — list active API keys for the authenticated user.
 * Returns prefix, name, lastUsedAt, createdAt (never the full key).
 */
export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keys = await db
    .select({
      id: apiKeys.id,
      prefix: apiKeys.prefix,
      name: apiKeys.name,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(
      and(eq(apiKeys.userId, session.user.id), isNull(apiKeys.revokedAt)),
    );

  return NextResponse.json(keys);
}

/**
 * POST /api/auth/api-keys — generate a new API key.
 * Body: { name?: string }
 * Returns the full key once — it cannot be retrieved again.
 */
export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
  };

  const { fullKey, keyHash, prefix } = generateApiKey();

  const [inserted] = await db
    .insert(apiKeys)
    .values({
      userId: session.user.id,
      prefix,
      keyHash,
      name: body.name ?? "KOReader",
    })
    .returning({ id: apiKeys.id, createdAt: apiKeys.createdAt });

  return NextResponse.json({
    id: inserted!.id,
    key: fullKey,
    prefix,
    name: body.name ?? "KOReader",
    createdAt: inserted!.createdAt,
  });
}

/**
 * DELETE /api/auth/api-keys — revoke an API key.
 * Body: { id: number }
 */
export async function DELETE(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { id: number };
  if (!body.id) {
    return NextResponse.json(
      { error: "Missing key id" },
      { status: 400 },
    );
  }

  const result = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, body.id),
        eq(apiKeys.userId, session.user.id),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({ id: apiKeys.id });

  if (!result.length) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  return NextResponse.json({ status: "revoked" });
}
