import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFavDetail, decryptCookie } from "@/lib/bili";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const mediaId = parseInt(searchParams.get("media_id") || "0");
    const page = parseInt(searchParams.get("page") || "1");

    if (!mediaId) {
      return Response.json({ error: "缺少 media_id" }, { status: 400 });
    }

    const u = await prisma.user.findUnique({
      where: { id: user.id },
      select: { bilibiliCookie: true },
    });

    if (!u?.bilibiliCookie) {
      return Response.json({ error: "请先登录B站" }, { status: 401 });
    }

    const cookie = decryptCookie(u.bilibiliCookie);
    const { songs, hasMore } = await getFavDetail(mediaId, cookie, page);

    return Response.json({ songs, hasMore });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[Bili Fav Detail]", err);
    return Response.json({ error: "获取收藏夹内容失败" }, { status: 500 });
  }
}
