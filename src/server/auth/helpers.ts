import { auth } from "~/server/auth";

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

  // 2. TODO: x-api-key lookup for KOReader plugin
  //    Will be implemented when API key generation is built.

  return null;
}
