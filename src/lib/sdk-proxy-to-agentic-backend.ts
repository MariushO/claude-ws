import { NextRequest, NextResponse } from 'next/server';

const SDK_BASE_URL = `http://localhost:${process.env.AGENTIC_SDK_PORT || '3100'}`;

// Headers that must not be forwarded between hops
const HOP_BY_HOP_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
]);

/**
 * Forward a Next.js request to the agentic-sdk Fastify backend.
 * Handles JSON, multipart, SSE streams, and binary responses.
 */
export async function proxyToSdk(
  request: NextRequest,
  method: string,
): Promise<NextResponse | Response> {
  try {
    const url = new URL(request.url);
    const target = `${SDK_BASE_URL}${url.pathname}${url.search}`;

    // Build forwarded headers
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        headers[key] = value;
      }
    });

    // Build fetch options
    const init: RequestInit = { method, headers };

    // Forward body for methods that carry one (arrayBuffer preserves multipart boundaries)
    if (method !== 'GET' && method !== 'HEAD') {
      init.body = await request.arrayBuffer();
    }

    const response = await fetch(target, init);

    // SSE: stream passthrough
    const responseContentType = response.headers.get('content-type') || '';
    if (responseContentType.includes('text/event-stream')) {
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // Build response headers (skip hop-by-hop)
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    // Return binary-safe response
    const body = await response.arrayBuffer();
    return new NextResponse(body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'SDK service unavailable' },
      { status: 502 },
    );
  }
}
