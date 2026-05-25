import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFavFolders, decryptCookie } from "@/lib/bili";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const u = await prisma.user.findUnique({
      where: { id: user.id },
      select: { bilibiliCookie: true, bilibiliUid: true, bilibiliUname: true },
    });

    if (!u?.bilibiliCookie || !u?.bilibiliUid) {
      return Response.json({ error: "请先登录B站" }, { status: 401 });
    }

    const cookie = decryptCookie(u.bilibiliCookie);
    const folders = await getFavFolders(u.bilibiliUid, cookie);

    return Response.json({ folders });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[Bili Fav List]", err);
    return Response.json({ error: "获取收藏夹失败" }, { status: 500 });
  }
}
