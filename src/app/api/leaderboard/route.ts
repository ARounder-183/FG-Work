import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "all"; // "today" | "week" | "month" | "all"

  let startDate: Date | undefined;
  if (period === "today") {
    startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
  } else if (period === "month") {
    startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);
    startDate.setHours(0, 0, 0, 0);
  }

  const dateFilter = startDate ? { date: { gte: startDate } } : {};

  // Aggregate total study time per user
  const userStats = await prisma.studyRecord.groupBy({
    by: ["userId"],
    where: dateFilter,
    _sum: { duration: true },
  });

  // Get user details
  const userIds = userStats.map((s) => s.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, avatar: true },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  const rankings = userStats
    .map((s) => {
      const user = userMap.get(s.userId);
      return {
        userId: s.userId,
        username: user?.username || "未知用户",
        avatar: user?.avatar || null,
        totalSeconds: s._sum.duration || 0,
      };
    })
    .sort((a, b) => b.totalSeconds - a.totalSeconds)
    .slice(0, 100)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  // Topic distribution (global)
  const topicStats = await prisma.studyRecord.groupBy({
    by: ["topicId"],
    where: dateFilter,
    _sum: { duration: true },
  });

  const topicIds = topicStats.map((t) => t.topicId);
  const topics = await prisma.studyTopic.findMany({
    where: { id: { in: topicIds } },
    select: { id: true, name: true, icon: true },
  });
  const topicMap = new Map(topics.map((t) => [t.id, t]));

  const totalSeconds = topicStats.reduce((sum, t) => sum + (t._sum.duration || 0), 0);
  const topicDistribution = topicStats
    .map((t) => {
      const topic = topicMap.get(t.topicId);
      const duration = t._sum.duration || 0;
      return {
        topicName: topic?.name || "未知",
        icon: topic?.icon || "",
        totalSeconds: duration,
        percentage: totalSeconds > 0 ? Math.round((duration / totalSeconds) * 100) : 0,
      };
    })
    .sort((a, b) => b.totalSeconds - a.totalSeconds);

  // Current user's rank
  const currentUser = await getCurrentUser();
  let myRank: { rank: number; totalSeconds: number } | null = null;
  if (currentUser) {
    const userAgg = await prisma.studyRecord.aggregate({
      where: { userId: currentUser.id, ...dateFilter },
      _sum: { duration: true },
    });
    const myTotal = userAgg._sum.duration || 0;
    const position = rankings.findIndex((r) => r.userId === currentUser.id);
    myRank = {
      rank: position >= 0 ? position + 1 : rankings.length + 1,
      totalSeconds: myTotal,
    };
  }

  return Response.json({ rankings, topicDistribution, myRank });
}
