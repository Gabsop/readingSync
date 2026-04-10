import { and, eq, isNull } from "drizzle-orm";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { apiKeys, users } from "~/server/db/schema";
import { hashApiKey } from "~/server/auth/api-key-utils";

/**
 * Resolve the authenticated user from a request.
 *
 * Checks:
 *  1. better-auth session cookie (mobile app & web)
 *  2. `x-api-key` header (KOReader plugin)
 *
 * Returns the session or null if unauthenticated.
 */
export async function getSessionFromRequest(request: Request) {
  // 1. Try better-auth session (cookie / Bearer token)
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (session) return session;

  // 2. x-api-key lookup for KOReader plugin
  const apiKey = request.headers.get("x-api-key");
  if (apiKey) {
    const keyHash = hashApiKey(apiKey);
    const row = await db
      .select({
        keyId: apiKeys.id,
        userId: apiKeys.userId,
        userName: users.name,
        userEmail: users.email,
        userImage: users.image,
      })
      .from(apiKeys)
      .innerJoin(users, eq(apiKeys.userId, users.id))
      .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return null;

    // Update lastUsedAt (fire-and-forget)
    void db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, row.keyId));

    // Return a session-like object matching better-auth's shape
    return {
      user: {
        id: row.userId,
        name: row.userName,
        email: row.userEmail,
        image: row.userImage,
      },
      session: {
        id: `apikey-${row.keyId}`,
        userId: row.userId,
        token: apiKey,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    };
  }

  return null;
}
