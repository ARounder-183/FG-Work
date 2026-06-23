import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { formatLocalDateKey } from "@/lib/study";

export async function GET() {
  try {
    const user = await requireAuth();

    const records = await prisma.studyRecord.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      select: { date: true, duration: true },
    });

    // Group by date, calculate total per day
    const dailyMap = new Map<string, number>();
    for (const r of records) {
      const key = formatLocalDateKey(r.date);
      dailyMap.set(key, (dailyMap.get(key) || 0) + r.duration);
    }

    const days = Array.from(dailyMap.entries())
      .map(([date, seconds]) => ({ date, seconds }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Calculate current streak (consecutive days from today backwards)
    const today = formatLocalDateKey(new Date());
    const dateSet = new Set(days.map((d) => d.date));

    let streak = 0;
    const checkDate = new Date();
    // Check if today has records, else start from yesterday
    if (!dateSet.has(today)) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    while (true) {
      const d = formatLocalDateKey(checkDate);
      if (dateSet.has(d)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    // Longest streak
    let longest = 0;
    let current = 0;
    const sortedDates = days.map((d) => d.date).sort();
    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) { current = 1; }
      else {
        const prev = new Date(sortedDates[i - 1]);
        const curr = new Date(sortedDates[i]);
        const diff = (curr.getTime() - prev.getTime()) / 86400000;
        if (diff === 1) { current++; }
        else { current = 1; }
      }
      longest = Math.max(longest, current);
    }

    const totalDays = days.length;
    const totalSeconds = days.reduce((s, d) => s + d.seconds, 0);

    return Response.json({ streak, longest, totalDays, totalSeconds, days: days.slice(0, 60) });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "获取失败" }, { status: 500 });
  }
}
