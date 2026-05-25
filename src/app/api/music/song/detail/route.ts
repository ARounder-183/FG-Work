import { NextRequest } from "next/server";
import { getVideoInfo } from "@/lib/bili";

const NCM_URL = process.env.NCM_API_URL || "http://localhost:4000";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const source = searchParams.get("source") || "ncm";
  const bvid = searchParams.get("bvid");

  // Bilibili: fetch cover from video info
  if (source === "bilibili" && bvid) {
    try {
      const info = await getVideoInfo(bvid);
      if (info?.pic) {
        // Bilibili covers use http:// — upgrade to https to avoid mixed content blocking
        const pic = info.pic
          .replace(/^https?:\/\//, "https://")
          .replace(/^\/\//, "https://");
        return Response.json({ picUrl: pic });
      }
    } catch { /* fall through to null */ }
    return Response.json({ picUrl: null });
  }

  // NCM path
  if (!id) return Response.json({ error: "缺少 ID" }, { status: 400 });

  try {
    const res = await fetch(`${NCM_URL}/song/detail?ids=${id}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return Response.json({ picUrl: null });
    const data = await res.json();
    const song = data?.songs?.[0];
    return Response.json({ picUrl: song?.al?.picUrl || null });
  } catch {
    return Response.json({ picUrl: null });
  }
}
