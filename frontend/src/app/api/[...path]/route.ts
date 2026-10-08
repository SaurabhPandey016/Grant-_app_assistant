import { randomUUID } from "node:crypto";
import type { ApiErrorBody } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestHeadersToForward = [
  "accept",
  "accept-language",
  "authorization",
  "content-type",
  "cookie",
  "origin",
  "user-agent",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
] as const;

const responseHeadersToForward = [
  "cache-control",
  "content-type",
  "set-cookie",
  "vary",
  "www-authenticate",
] as const;

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxyRequest(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const requestId = randomUUID();
  let target: URL;

  try {
    target = new URL(process.env.BACKEND_URL ?? "http://localhost:3001");
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return proxyError(500, "BACKEND_CONFIGURATION_INVALID", "The backend URL must use HTTP or HTTPS.", requestId);
    }
  } catch {
    return proxyError(500, "BACKEND_CONFIGURATION_INVALID", "The configured backend URL is invalid.", requestId);
  }

  target.pathname = `/api/v1/${path.map(encodeURIComponent).join("/")}`;
  target.search = new URL(request.url).search;
  target.hash = "";

  const headers = new Headers();
  for (const name of requestHeadersToForward) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
    });
    const responseHeaders = new Headers();

    for (const name of responseHeadersToForward) {
      if (name === "set-cookie") {
        for (const cookie of upstream.headers.getSetCookie()) {
          responseHeaders.append(name, cookie);
        }
      } else {
        const value = upstream.headers.get(name);
        if (value !== null) responseHeaders.set(name, value);
      }
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (!(error instanceof TypeError) && !(error instanceof Error && error.name === "AbortError")) {
      throw error;
    }
    return proxyError(
      503,
      "BACKEND_UNAVAILABLE",
      "The backend is waking up or temporarily unavailable. Please wait while the app retries.",
      requestId,
    );
  }
}

function proxyError(
  status: number,
  code: string,
  message: string,
  requestId: string,
): Response {
  const body: ApiErrorBody = {
    error: { code, message, requestId },
  };

  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": "2",
      "X-Request-Id": requestId,
    },
  });
}

export const GET = proxyRequest;
export const HEAD = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const OPTIONS = proxyRequest;
