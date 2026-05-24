import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(Number(searchParams.get("limit")) || 20, 50);

  const posts = await prisma.post.findMany({
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, username: true, avatar: true } },
      _count: { select: { comments: true } },
    },
  });

  const hasMore = posts.length > limit;
  const data = hasMore ? posts.slice(0, limit) : posts;

  return Response.json({ posts: data, hasMore, nextCursor: hasMore ? data[data.length - 1].id : null });
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { title, content, images } = await req.json();

    if (!title || !title.trim()) {
      return Response.json({ error: "标题不能为空" }, { status: 400 });
    }
    if (!content || !content.trim()) {
      return Response.json({ error: "内容不能为空" }, { status: 400 });
    }

    const post = await prisma.post.create({
      data: {
        title: title.trim().slice(0, 100),
        content: content.trim(),
        images: JSON.stringify(images || []),
        userId: user.id,
      },
      include: {
        user: { select: { id: true, username: true, avatar: true } },
        _count: { select: { comments: true } },
      },
    });

    return Response.json({ post }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "发布失败" }, { status: 500 });
  }
}
