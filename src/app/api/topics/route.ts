import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireAuth();
    const topics = await prisma.studyTopic.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    return Response.json({ topics });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "获取失败" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { name, icon } = await req.json();
    if (!name || !name.trim()) return Response.json({ error: "请输入主题名称" }, { status: 400 });

    const existing = await prisma.studyTopic.findUnique({
      where: { userId_name: { userId: user.id, name: name.trim() } },
    });
    if (existing) return Response.json({ error: "主题已存在" }, { status: 409 });

    const topic = await prisma.studyTopic.create({
      data: { name: name.trim(), icon: icon || "📌", userId: user.id },
    });
    return Response.json({ topic }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "创建失败" }, { status: 500 });
  }
}
