import { NextRequest } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Audio proxy for Bilibili CDN.
 * Returns upstream.body directly — no buffering, no TransformStream.
 * Next.js passes the ReadableStream straight to the Node.js HTTP response:
 * chunks arrive from CDN → immediately written to client socket.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const encoded = searchParams.get("url");

  if (!encoded) {
    return Response.json({ error: "Missing url" }, { status: 400 });
  }

  let targetUrl: string;
  try {
    targetUrl = Buffer.from(encoded, "base64").toString("utf-8");
  } catch {
    return Response.json({ error: "Invalid url encoding" }, { status: 400 });
  }

  if (!targetUrl.startsWith("https://")) {
    return Response.json({ error: "Invalid url scheme" }, { status: 400 });
  }

  try {
    const upstreamHeaders: Record<string, string> = {
      "User-Agent": UA,
      Referer: "https://www.bilibili.com/",
      Origin: "https://www.bilibili.com",
    };

    const clientRange = req.headers.get("range");
    if (clientRange) {
      upstreamHeaders.Range = clientRange;
    }

    const upstream = await fetch(targetUrl, {
      headers: upstreamHeaders,
    });

    if (!upstream.ok && upstream.status !== 206) {
      return Response.json({ error: `Upstream ${upstream.status}` }, { status: 502 });
    }

    if (!upstream.body) {
      return Response.json({ error: "Empty upstream body" }, { status: 502 });
    }

    // upstream.body is a ReadableStream — chunks arrive from CDN progressively.
    // Passing it directly to new Response() lets Next.js stream it to the client.
    // The client's <audio> element receives data as it arrives → plays immediately.
    const responseHeaders: Record<string, string> = {
      "Content-Type": upstream.headers.get("Content-Type") || "audio/mp4",
    };

    const acceptRanges = upstream.headers.get("Accept-Ranges");
    if (acceptRanges) responseHeaders["Accept-Ranges"] = acceptRanges;

    const contentLength = upstream.headers.get("Content-Length");
    if (contentLength) responseHeaders["Content-Length"] = contentLength;

    const contentRange = upstream.headers.get("Content-Range");
    if (contentRange) responseHeaders["Content-Range"] = contentRange;

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (e) {
    console.error("[Audio Proxy]", e);
    return Response.json({ error: "Proxy fetch failed" }, { status: 502 });
  }
}
