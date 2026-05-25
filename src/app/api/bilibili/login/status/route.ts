import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireAuth();
    const u = await prisma.user.findUnique({
      where: { id: user.id },
      select: { bilibiliCookie: true, bilibiliUid: true, bilibiliUname: true },
    });

    const loggedIn = !!u?.bilibiliCookie;
    return Response.json({
      loggedIn,
      bilibiliUid: u?.bilibiliUid || null,
      bilibiliUname: u?.bilibiliUname || null,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "查询失败" }, { status: 500 });
  }
}
