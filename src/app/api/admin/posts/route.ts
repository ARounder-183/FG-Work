import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  try {
    await requireAdmin();
    const posts = await prisma.post.findMany({
      include: { user: { select: { id: true, username: true } }, _count: { select: { comments: true } } },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ posts });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "获取失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return Response.json({ error: "缺少帖子 ID" }, { status: 400 });

    await prisma.post.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "删除失败" }, { status: 500 });
  }
}
