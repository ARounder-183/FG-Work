import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { formatLocalDateKey } from "@/lib/study";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month"); // YYYY-MM

    const today = new Date();
    const year = month ? parseInt(month.split("-")[0]) : today.getFullYear();
    const mon = month ? parseInt(month.split("-")[1]) - 1 : today.getMonth();

    const start = new Date(year, mon, 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(year, mon + 1, 1);
    end.setHours(0, 0, 0, 0);

    const records = await prisma.studyRecord.findMany({
      where: { userId: user.id, date: { gte: start, lt: end } },
      orderBy: { date: "asc" },
    });

    // Group by date, sum durations
    const map = new Map<string, number>();
    for (const r of records) {
      const key = formatLocalDateKey(r.date);
      map.set(key, (map.get(key) || 0) + r.duration);
    }

    const days = Array.from(map.entries()).map(([date, seconds]) => ({ date, seconds }));

    return Response.json({ year, month: mon + 1, days });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "获取失败" }, { status: 500 });
  }
}
