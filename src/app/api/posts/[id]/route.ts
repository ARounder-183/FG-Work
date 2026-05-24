import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true, avatar: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, username: true, avatar: true } } },
      },
    },
  });

  if (!post) {
    return Response.json({ error: "帖子不存在" }, { status: 404 });
  }

  return Response.json({ post: { ...post, images: JSON.parse(post.images) } });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) return Response.json({ error: "帖子不存在" }, { status: 404 });
    if (post.userId !== user.id) return Response.json({ error: "无权编辑" }, { status: 403 });

    const { title, content, images } = await req.json();
    const updated = await prisma.post.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim().slice(0, 100) }),
        ...(content !== undefined && { content: content.trim() }),
        ...(images !== undefined && { images: JSON.stringify(images) }),
      },
      include: {
        user: { select: { id: true, username: true, avatar: true } },
        _count: { select: { comments: true } },
      },
    });

    return Response.json({ post: updated });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "编辑失败" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) return Response.json({ error: "帖子不存在" }, { status: 404 });
    if (post.userId !== user.id) return Response.json({ error: "无权删除" }, { status: 403 });

    await prisma.post.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "删除失败" }, { status: 500 });
  }
}
