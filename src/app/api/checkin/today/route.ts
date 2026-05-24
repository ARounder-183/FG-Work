import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireAuth();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const records = await prisma.studyRecord.findMany({
      where: { userId: user.id, date: today },
      include: { topic: true },
    });

    const totalSeconds = records.reduce((sum, r) => sum + r.duration, 0);

    return Response.json({
      records,
      totalSeconds,
      totalMinutes: Math.floor(totalSeconds / 60),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "获取失败" }, { status: 500 });
  }
}
