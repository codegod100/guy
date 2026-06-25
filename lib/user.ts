/**
 * Extract a stable user identifier from the inbound request.
 *
 * On Vercel: decodes the OIDC JWT's `external_sub` (user-level identity) or
 * `sub` claim. The token is already verified by Vercel's edge, so we only
 * base64-decode the payload — no signature check needed here.
 *
 * In local dev: returns a fixed dev user so the API works without Vercel.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    // Base64url → base64
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    // Add padding
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function getUserIdFromRequest(request: Request): string | null {
  const oidcToken = request.headers.get("x-vercel-oidc-token");

  if (oidcToken) {
    const payload = decodeJwtPayload(oidcToken);
    // `external_sub` is set when a real Vercel user authenticated.
    // Fall back to `sub` (project-level identity) if missing.
    const userId = (payload?.external_sub ?? payload?.sub) as
      | string
      | undefined;
    if (userId) return userId;
  }

  // Local dev — no OIDC token, use a fixed identity
  if (process.env.VERCEL !== "1") {
    return "local-dev-user";
  }

  return null;
}
