import { auth } from "~/server/auth";

/**
 * GET-based entry point for mobile OAuth.
 *
 * The mobile app opens this URL in a browser. We call better-auth's
 * signInSocial (POST-only) internally via auth.handler, then forward
 * the state cookie and redirect the browser to Google's consent screen.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") ?? "google";
  const callbackURL =
    url.searchParams.get("callbackURL") ?? "/api/auth/mobile-callback";

  const internalReq = new Request(
    url.origin + "/api/auth/sign-in/social",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, callbackURL }),
    },
  );

  const res = await auth.handler(internalReq);
  const redirectUrl = res.headers.get("location");

  if (!redirectUrl) {
    return new Response("Failed to initiate OAuth flow", { status: 500 });
  }

  const redirect = new Response(null, { status: 302 });
  redirect.headers.set("Location", redirectUrl);

  const stateCookie = res.headers.get("set-cookie");
  if (stateCookie) {
    redirect.headers.set("Set-Cookie", stateCookie);
  }

  return redirect;
}
