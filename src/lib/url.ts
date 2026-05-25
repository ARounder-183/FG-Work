const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const apiUrl = (path: string) => `${BASE}${path}`;

/**
 * Proxy external images through our server.
 * Bilibili CDN (hdslb.com) requires Referer header — browser <img> can't send it.
 */
export function proxyImage(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  // Already proxied or relative/local path — pass through
  if (url.startsWith(BASE + "/api/") || url.startsWith("/api/") || url.startsWith("data:")) return url;
  // External URL — proxy
  const encoded = btoa(url);
  return apiUrl(`/api/image/proxy?url=${encodeURIComponent(encoded)}`);
}
