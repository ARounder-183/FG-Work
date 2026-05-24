import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; cid: string }> }
) {
  try {
    const user = await requireAuth();
    const { cid } = await params;

    const comment = await prisma.comment.findUnique({ where: { id: cid } });
    if (!comment) return Response.json({ error: "评论不存在" }, { status: 404 });
    if (comment.userId !== user.id) return Response.json({ error: "无权删除" }, { status: 403 });

    await prisma.comment.delete({ where: { id: cid } });
    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "删除失败" }, { status: 500 });
  }
}
