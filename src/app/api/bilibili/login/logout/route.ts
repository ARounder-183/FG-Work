import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const user = await requireAuth();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        bilibiliCookie: null,
        bilibiliUid: null,
        bilibiliUname: null,
      },
    });
    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "登出失败" }, { status: 500 });
  }
}
