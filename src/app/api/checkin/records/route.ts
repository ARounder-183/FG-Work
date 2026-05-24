import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date");

    const where: Record<string, unknown> = { userId: user.id };
    if (dateStr) {
      const d = new Date(dateStr);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      where.date = { gte: d, lt: next };
    }

    const records = await prisma.studyRecord.findMany({
      where,
      include: { topic: true },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ records });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "获取失败" }, { status: 500 });
  }
}
