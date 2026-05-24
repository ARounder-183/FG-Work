import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const comments = await prisma.comment.findMany({
    where: { postId: id },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, username: true, avatar: true } } },
  });

  return Response.json({ comments });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const { content } = await req.json();

    if (!content || !content.trim()) {
      return Response.json({ error: "评论不能为空" }, { status: 400 });
    }

    const comment = await prisma.comment.create({
      data: {
        content: content.trim().slice(0, 500),
        userId: user.id,
        postId: id,
      },
      include: { user: { select: { id: true, username: true, avatar: true } } },
    });

    return Response.json({ comment }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "评论失败" }, { status: 500 });
  }
}
