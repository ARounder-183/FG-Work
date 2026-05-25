import { NextRequest } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Audio proxy for Bilibili CDN — browsers can't play Bilibili audio directly
 * because the CDN checks Referer/Origin headers.
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
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent": UA,
        Referer: "https://www.bilibili.com/",
        Origin: "https://www.bilibili.com",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok || !upstream.body) {
      return Response.json({ error: `Upstream ${upstream.status}` }, { status: 502 });
    }

    // Stream the response back — passthrough content-type from upstream.
    // NOTE: do NOT set Accept-Ranges — we proxy Bilibili DASH audio which
    // doesn't support seeking; claiming otherwise misleads the browser.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "audio/mp4",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    console.error("[Audio Proxy]", e);
    return Response.json({ error: "Proxy fetch failed" }, { status: 502 });
  }
}
