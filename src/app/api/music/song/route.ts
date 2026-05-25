import { NextRequest } from "next/server";
import { getSongUrl } from "@/lib/ncm";
import { getAudioUrl as getBiliAudioUrl } from "@/lib/bili";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptCookie } from "@/lib/bili";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const source = searchParams.get("source") || "ncm";
  const bvid = searchParams.get("bvid");
  const cid = searchParams.get("cid");

  // Bilibili path
  if (source === "bilibili") {
    if (!bvid) {
      return Response.json({ error: "B站歌曲需要 bvid" }, { status: 400 });
    }

    // Each client needs its own B站 CDN URL — the URL is session-bound
    let cookie: string | undefined;
    try {
      const user = await getCurrentUser().catch(() => null);
      if (user) {
        const u = await prisma.user.findUnique({
          where: { id: user.id },
          select: { bilibiliCookie: true },
        });
        if (u?.bilibiliCookie) {
          cookie = decryptCookie(u.bilibiliCookie);
        }
      }
    } catch { /* silently continue without cookie */ }

    const rawUrl = await getBiliAudioUrl(bvid, parseInt(cid || "0"), cookie);
    // Don't rewrite bilibili CDN URLs to https — they use custom schemes
    return Response.json({ url: rawUrl });
  }

  // NCM path (existing)
  if (!id) return Response.json({ error: "请输入歌曲 ID" }, { status: 400 });

  const rawUrl = await getSongUrl(id);
  const url = rawUrl ? rawUrl.replace(/^http:/, "https:") : null;
  if (!url) {
    console.log(`[NCM] No URL found for song ${id}`);
  }
  return Response.json({ url });
}
