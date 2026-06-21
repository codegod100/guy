const EVE_PREFIX = "/eve";

function buildUpstreamUrl(request: Request, pathParts: string[]): URL {
  const url = new URL(request.url);
  url.pathname = `${EVE_PREFIX}/${pathParts.join("/")}`;
  return url;
}

function buildUpstreamHeaders(request: Request): Headers {
  const oidcToken = request.headers.get("x-vercel-oidc-token");
  if (!oidcToken) {
    throw new Error(
      "x-vercel-oidc-token is missing. This proxy must run on Vercel.",
    );
  }

  const headers = new Headers(request.headers);
  headers.set("authorization", `Bearer ${oidcToken}`);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("x-vercel-oidc-token");
  return headers;
}

async function proxy(request: Request, pathParts: string[]): Promise<Response> {
  let headers: Headers;
  try {
    headers = buildUpstreamHeaders(request);
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to build upstream auth.",
      },
      { status: 401 },
    );
  }

  const upstreamUrl = buildUpstreamUrl(request, pathParts);
  const method = request.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers,
    redirect: "manual",
    body: method === "GET" || method === "HEAD" ? undefined : request.body,
    // @ts-expect-error Node fetch requires duplex for streaming request bodies.
    duplex: method === "GET" || method === "HEAD" ? undefined : "half",
  };

  const upstream = await fetch(upstreamUrl, init);
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

function getPathParts(params: { path?: string[] }): string[] {
  return params.path ?? [];
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const params = await context.params;
  return proxy(request, getPathParts(params));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const params = await context.params;
  return proxy(request, getPathParts(params));
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const params = await context.params;
  return proxy(request, getPathParts(params));
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const params = await context.params;
  return proxy(request, getPathParts(params));
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const params = await context.params;
  return proxy(request, getPathParts(params));
}
