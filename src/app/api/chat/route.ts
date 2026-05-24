import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const messages = await prisma.chatMessage.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, username: true, avatar: true } } },
  });
  return Response.json({ messages: messages.reverse() });
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { content } = await req.json();
    if (!content || !content.trim()) return Response.json({ error: "消息不能为空" }, { status: 400 });

    const msg = await prisma.chatMessage.create({
      data: { content: content.trim().slice(0, 500), userId: user.id },
      include: { user: { select: { id: true, username: true, avatar: true } } },
    });

    return Response.json({ message: msg }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "发送失败" }, { status: 500 });
  }
}
