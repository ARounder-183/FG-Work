// Service Worker: intercept B站 CDN audio requests and add required headers
// B站 CDN requires Referer: https://www.bilibili.com/ — browser <audio> can't set this natively

const BILI_CDN_PATTERNS = [
  /bilivideo\.com/,
  /mcdn\.bilivideo\.cn/,
  /hdslb\.com/,
];

function isBiliCdn(url: string): boolean {
  return BILI_CDN_PATTERNS.some((p) => p.test(url));
}

self.addEventListener("fetch", (event: FetchEvent) => {
  const url = event.request.url;
  if (!isBiliCdn(url)) return;

  // Build modified headers from ORIGINAL request — preserves Range, Accept, etc.
  const headers = new Headers(event.request.headers);
  headers.set("Referer", "https://www.bilibili.com/");
  headers.set("Origin", "https://www.bilibili.com");

  // new Request(event.request, { headers }) keeps method/mode/credentials/body
  // from the original <audio> element request (preserves Range headers for seeking)
  const modified = new Request(event.request, { headers });

  console.log("[SW] 直连", url.slice(0, 80));

  event.respondWith(
    fetch(modified)
      .then((res) => {
        console.log("[SW] ✅", res.status, res.headers.get("content-type") || "?",
          "size:", res.headers.get("content-length") || "?");
        return res;
      })
      .catch((err) => {
        console.warn("[SW] ❌", err.message);
        // Don't throw — try letting original request through
        // If that also fails, browser fires error → client falls back to proxy
        return fetch(event.request);
      })
  );
});
