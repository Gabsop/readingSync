import { auth } from "~/server/auth";

const ALLOWED_SCHEMES = ["readingsync://", "exp://"];

/**
 * After better-auth completes Google OAuth and sets the session cookie,
 * this endpoint reads the session and redirects to the mobile app's
 * custom scheme with the session token as a query parameter.
 *
 * The mobile app stores this token in expo-secure-store and uses it
 * as a Bearer token on subsequent API requests.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectUri = url.searchParams.get("redirect_uri") ?? "readingsync://auth-callback";

  // Validate the redirect URI to prevent open redirect attacks
  const isAllowed = ALLOWED_SCHEMES.some((scheme) => redirectUri.startsWith(scheme));
  if (!isAllowed) {
    return new Response("Invalid redirect_uri", { status: 400 });
  }

  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    const errorUrl = new URL(redirectUri);
    errorUrl.searchParams.set("error", "unauthenticated");
    return Response.redirect(errorUrl.toString(), 302);
  }

  const successUrl = new URL(redirectUri);
  successUrl.searchParams.set("token", session.session.token);
  return Response.redirect(successUrl.toString(), 302);
}
