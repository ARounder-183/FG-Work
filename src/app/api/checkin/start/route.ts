import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();

    // End any existing active check-in first
    const existing = await prisma.checkIn.findFirst({
      where: { userId: user.id, endedAt: null },
    });
    if (existing) {
      const duration = Math.round((Date.now() - new Date(existing.startedAt).getTime()) / 1000);
      await prisma.checkIn.update({
        where: { id: existing.id },
        data: { endedAt: new Date(), duration },
      });
    }

    const { topicId } = await req.json();
    if (!topicId) return Response.json({ error: "请选择主题" }, { status: 400 });

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
