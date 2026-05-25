// Service Worker: intercept B站 CDN audio requests and add required headers
// B站 CDN requires Referer: https://www.bilibili.com/ — browser <audio> can't set this natively
// This SW modifies the request headers before they reach the network

const BILI_CDN_PATTERNS = [
  /bilivideo\.com/,
  /mcdn\.bilivideo\.cn/,
  /hdslb\.com/,
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function isBiliCdn(url: string): boolean {
  return BILI_CDN_PATTERNS.some((p) => p.test(url));
}

self.addEventListener("fetch", (event: FetchEvent) => {
  const url = event.request.url;

  // Only intercept B站 CDN requests
  if (!isBiliCdn(url)) return;

  // Clone and modify headers
  const headers = new Headers(event.request.headers);
  headers.set("Referer", "https://www.bilibili.com/");
  if (!headers.has("Origin")) {
    headers.set("Origin", "https://www.bilibili.com");
  }
  headers.set("User-Agent", UA);

  const modified = new Request(url, {
    method: event.request.method,
    headers,
    mode: "cors",
    credentials: "omit",
  });

  event.respondWith(
    fetch(modified)
      .then((res) => {
        console.log("[SW 直连] ✅", res.status, url.slice(0, 80));
        return res;
      })
      .catch((err) => {
        console.warn("[SW 直连] ❌ 失败，将降级到代理:", err.message);
        throw err; // let browser fire error event → client falls back to proxy
      })
  );
});
