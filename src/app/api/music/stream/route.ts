import { NextRequest } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Audio proxy for Bilibili CDN — browsers can't play Bilibili audio directly
 * because the CDN checks Referer/Origin headers.
 *
 * Also forwards Range requests so the browser can seek (sync playback).
 *
 * Client requests: GET /api/music/stream?url=BASE64_ENCODED_CDN_URL
 * Server fetches with proper headers and streams back.
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

    // Forward Range header so CDN can serve partial content for seeking
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

    // Passthrough headers from CDN — critical for seeking:
    //   Accept-Ranges: tells browser seeking is supported
    //   Content-Length: total file size (browser uses for seek position calc)
    //   Content-Range: 206 response range info
    const responseHeaders: Record<string, string> = {
      "Cache-Control": "public, max-age=3600",
    };

    // Always pass content-type
    responseHeaders["Content-Type"] =
      upstream.headers.get("Content-Type") || "audio/mp4";

    // Pass through range-related headers if CDN supports them
    const acceptRanges = upstream.headers.get("Accept-Ranges");
    if (acceptRanges) {
      responseHeaders["Accept-Ranges"] = acceptRanges;
    }

    const contentLength = upstream.headers.get("Content-Length");
    if (contentLength) {
      responseHeaders["Content-Length"] = contentLength;
    }

    const contentRange = upstream.headers.get("Content-Range");
    if (contentRange) {
      responseHeaders["Content-Range"] = contentRange;
    }

    return new Response(upstream.body, {
      status: upstream.status, // 200 or 206
      headers: responseHeaders,
    });
  } catch (e) {
    console.error("[Audio Proxy]", e);
    return Response.json({ error: "Proxy fetch failed" }, { status: 502 });
  }
}
