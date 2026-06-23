import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = PrismaClient | Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

interface TopicShape {
  id: string;
  name: string;
  icon: string | null;
}

interface SummaryRow {
  topic: TopicShape;
  duration: number;
}

export function startOfLocalDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getElapsedSeconds(startedAt: Date, endedAt = new Date()): number {
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
}

function nextDay(day: Date): Date {
  const result = new Date(day);
  result.setDate(result.getDate() + 1);
  return result;
}

function splitDurationByDay(startedAt: Date, endedAt: Date) {
  if (endedAt <= startedAt) return [] as Array<{ date: Date; duration: number }>;

  const segments: Array<{ date: Date; duration: number }> = [];
  let cursor = new Date(startedAt);

  while (cursor < endedAt) {
    const dayStart = startOfLocalDay(cursor);
    const dayEnd = nextDay(dayStart);
    const segmentEnd = dayEnd < endedAt ? dayEnd : endedAt;
    const duration = Math.max(0, Math.round((segmentEnd.getTime() - cursor.getTime()) / 1000));

    if (duration > 0) {
      segments.push({ date: dayStart, duration });
    }

    cursor = segmentEnd;
  }

  return segments;
}

async function addDurationToRecords(
  db: DbClient,
  userId: string,
  topicId: string,
  startedAt: Date,
  endedAt: Date,
) {
  const segments = splitDurationByDay(startedAt, endedAt);

  for (const segment of segments) {
    const existing = await db.studyRecord.findFirst({
      where: { userId, topicId, date: segment.date },
    });

    if (existing) {
      await db.studyRecord.update({
        where: { id: existing.id },
        data: { duration: existing.duration + segment.duration },
      });
      continue;
    }

    await db.studyRecord.create({
      data: {
        userId,
        topicId,
        duration: segment.duration,
        date: segment.date,
      },
    });
  }
}

export async function closeActiveCheckIn(userId: string, endedAt = new Date()) {
  return prisma.$transaction(async (tx) => {
    const active = await tx.checkIn.findFirst({
      where: { userId, endedAt: null },
      include: { topic: true },
      orderBy: { startedAt: "desc" },
    });

    if (!active) return null;

    const duration = getElapsedSeconds(active.startedAt, endedAt);
    const checkIn = await tx.checkIn.update({
      where: { id: active.id },
      data: { endedAt, duration },
      include: { topic: true },
    });

    await addDurationToRecords(tx, active.userId, active.topicId, active.startedAt, endedAt);

    return { checkIn, duration };
  });
}

export async function syncActiveCheckInDuration(userId: string, now = new Date()) {
  const active = await prisma.checkIn.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (!active) return null;

  const duration = getElapsedSeconds(active.startedAt, now);
  await prisma.checkIn.update({
    where: { id: active.id },
    data: { duration },
  });

  return { id: active.id, duration };
}

export async function getTodayStudySummary(userId: string, now = new Date()) {
  const today = startOfLocalDay(now);
  const rows = await prisma.studyRecord.findMany({
    where: { userId, date: today },
    include: { topic: true },
  });

  const merged = new Map<string, SummaryRow>();

  for (const row of rows) {
    merged.set(row.topicId, {
      topic: {
        id: row.topic.id,
        name: row.topic.name,
        icon: row.topic.icon,
      },
      duration: row.duration,
    });
  }

  const active = await prisma.checkIn.findFirst({
    where: { userId, endedAt: null },
    include: { topic: true },
    orderBy: { startedAt: "desc" },
  });

  if (active) {
    const effectiveStart = active.startedAt > today ? active.startedAt : today;
    const activeDuration = getElapsedSeconds(effectiveStart, now);

    if (activeDuration > 0) {
      const current = merged.get(active.topicId);
      merged.set(active.topicId, {
        topic: {
          id: active.topic.id,
          name: active.topic.name,
          icon: active.topic.icon,
        },
        duration: (current?.duration ?? 0) + activeDuration,
      });
    }
  }

  const records = Array.from(merged.values()).sort((a, b) => b.duration - a.duration);
  const totalSeconds = records.reduce((sum, item) => sum + item.duration, 0);

  return {
    records,
    totalSeconds,
    totalMinutes: Math.floor(totalSeconds / 60),
  };
}
