import { NextRequest } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Image proxy — Bilibili CDN (hdslb.com) requires Referer header.
 * Browser <img> tags can't send custom Referer, so we proxy through server.
 *
 * Client: <img src="/api/image/proxy?url=BASE64_URL" />
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
    return Response.json({ error: "Invalid encoding" }, { status: 400 });
  }

  if (!targetUrl.startsWith("http")) {
    return Response.json({ error: "Invalid scheme" }, { status: 400 });
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent": UA,
        Referer: "https://www.bilibili.com/",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!upstream.ok || !upstream.body) {
      return Response.json({ error: `Upstream ${upstream.status}` }, { status: 502 });
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    console.error("[Image Proxy]", e);
    return Response.json({ error: "Proxy failed" }, { status: 502 });
  }
}
