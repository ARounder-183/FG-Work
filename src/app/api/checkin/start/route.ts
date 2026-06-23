import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { closeActiveCheckIn } from "@/lib/study";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();

    const { topicId } = await req.json();
    if (!topicId) return Response.json({ error: "请选择主题" }, { status: 400 });

    const topic = await prisma.studyTopic.findFirst({
      where: { id: topicId, userId: user.id },
    });
    if (!topic) {
      return Response.json({ error: "主题不存在" }, { status: 404 });
    }

    await closeActiveCheckIn(user.id);

    const checkIn = await prisma.checkIn.create({
      data: { userId: user.id, topicId },
      include: { topic: true },
    });

    return Response.json({ checkIn }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "开始失败" }, { status: 500 });
  }
}
