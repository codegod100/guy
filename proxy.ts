import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isRunningOnVercel(): boolean {
  return process.env.VERCEL === "1";
}

export function proxy(request: NextRequest) {
  // Inject the Vercel OIDC token as a Bearer token so Eve's vercelOidc()
  // channel auth can read it, then rewrite /api/eve/* → /eve/* so the
  // request flows directly to the Eve service (via withEve's rewrites)
  // instead of making a self-referencing fetch() through a route handler.
  const oidcToken = request.headers.get("x-vercel-oidc-token");

  if (isRunningOnVercel() && !oidcToken) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "x-vercel-oidc-token is missing. Vercel OIDC must be enabled for this deployment.",
      },
      { status: 401 },
    );
  }

  // Rewrite /api/eve/:path* → /eve/:path*
  // withEve already maps /eve/* → Eve service (local dev or Vercel)
  const newUrl = request.nextUrl.clone();
  newUrl.pathname = newUrl.pathname.replace(/^\/api/, "");

  const headers = new Headers(request.headers);

  if (oidcToken) {
    headers.set("authorization", `Bearer ${oidcToken}`);
    headers.delete("x-vercel-oidc-token");
  }
  // In local dev there is no OIDC token; withEve proxies to the local Eve
  // dev server and Eve's localDev() channel auth allows unauthenticated
  // localhost requests.

  return NextResponse.rewrite(newUrl, { request: { headers } });
}

export const config = {
  matcher: "/api/eve/:path*",
};
