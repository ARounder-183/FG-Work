import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function POST() {
  try {
    const user = await requireAuth();

    const active = await prisma.checkIn.findFirst({
      where: { userId: user.id, endedAt: null },
    });
    if (!active) return Response.json({ error: "没有进行中的打卡" }, { status: 400 });

    const duration = Math.round((Date.now() - new Date(active.startedAt).getTime()) / 1000);

    const checkIn = await prisma.checkIn.update({
      where: { id: active.id },
      data: { endedAt: new Date(), duration },
      include: { topic: true },
    });

    // Aggregate into daily study record
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.studyRecord.findFirst({
      where: { userId: user.id, topicId: active.topicId, date: today },
    });

    if (existing) {
      await prisma.studyRecord.update({
        where: { id: existing.id },
        data: { duration: existing.duration + duration },
      });
    } else {
      await prisma.studyRecord.create({
        data: {
          userId: user.id,
          topicId: active.topicId,
          duration,
          date: today,
        },
      });
    }

    return Response.json({ checkIn, duration });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "结束失败" }, { status: 500 });
  }
}
