import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { advanceToNextSong } from "../advance";

export async function GET() {
  let state = await prisma.musicState.findUnique({ where: { id: "singleton" } });
  if (!state) state = await prisma.musicState.create({ data: { id: "singleton" } });

  const queueOrder: string[] = JSON.parse(state.queueOrder);

  // No active users → clear
  if (queueOrder.length === 0 && state.currentSong) {
    state = await prisma.musicState.update({
      where: { id: "singleton" },
      data: { currentSong: null, currentUserSongId: null, isPlaying: false, position: 0 },
    });
  }

  // Clean up songs from inactive users
  if (queueOrder.length > 0) {
    await prisma.userSong.updateMany({
      where: { played: false, userId: { notIn: queueOrder } },
      data: { played: true },
    });
  }

  // Auto-start if idle and has active users with songs
  const unplayedCount = await prisma.userSong.count({
    where: { played: false, userId: { in: queueOrder.length > 0 ? queueOrder : undefined } },
  });

  if (!state.currentSong && unplayedCount > 0 && queueOrder.length > 0) {
    await advanceToNextSong(null);
    state = (await prisma.musicState.findUnique({ where: { id: "singleton" } }))!;
  }

  if (unplayedCount === 0 && state.currentSong) {
    state = await prisma.musicState.update({
      where: { id: "singleton" },
      data: { currentSong: null, currentUserSongId: null, isPlaying: false, position: 0 },
    });
  }

  // Derive current user song from state
  let currentUserSong: { id: string; userId: string; user: { username: string; avatar: string | null } } | null = null;
  if (state.currentUserSongId) {
    currentUserSong = await prisma.userSong.findUnique({
      where: { id: state.currentUserSongId },
      include: { user: { select: { id: true, username: true, avatar: true } } },
    });
  }

  // Fix stale pointer
  if (!currentUserSong && state.currentSong) {
    await advanceToNextSong(null);
    state = (await prisma.musicState.findUnique({ where: { id: "singleton" } }))!;
    if (state.currentUserSongId) {
      currentUserSong = await prisma.userSong.findUnique({
        where: { id: state.currentUserSongId },
        include: { user: { select: { id: true, username: true, avatar: true } } },
      });
    }
  }

  const currentSong = state.currentSong ? JSON.parse(state.currentSong) : null;

  // Users sorted by whose turn is next
  const users = await prisma.user.findMany({
    where: { id: { in: queueOrder } },
    select: { id: true, username: true, avatar: true },
  });

  // Skip votes
  let skipVotes: string[] = [];
  if (currentUserSong) {
    const votes = await prisma.skipVote.findMany({
      where: { songId: currentUserSong.id },
      select: { userId: true },
    });
    skipVotes = votes.map((v) => v.userId);
  }

  // Full queue (only active users, unplayed)
  const fullQueue = await prisma.userSong.findMany({
    where: { played: false, userId: { in: queueOrder } },
    orderBy: { sortOrder: "asc" },
    include: { user: { select: { id: true, username: true, avatar: true } } },
  });

  return Response.json({
    state: { ...state, currentSong },
    users,
    skipVotes,
    activeCount: queueOrder.length,
    skipThreshold: Math.ceil(queueOrder.length / 2),
    currentUserSong,
    fullQueue,
  });
}

export async function PUT(req: NextRequest) {
  try {
    const { isPlaying, position, nextSong } = await req.json();
    let state = await prisma.musicState.findUnique({ where: { id: "singleton" } });
    if (!state) return Response.json({ error: "状态不存在" }, { status: 404 });

    const updateData: Record<string, unknown> = {};
    if (isPlaying !== undefined) updateData.isPlaying = isPlaying;
    if (position !== undefined) updateData.position = position;

    if (nextSong && state.currentSong) {
      await advanceToNextSong(state.currentUserSongId
        ? (await prisma.userSong.findUnique({ where: { id: state.currentUserSongId }, select: { userId: true } }))?.userId || null
        : null);
    } else {
      await prisma.musicState.update({ where: { id: "singleton" }, data: updateData });
    }

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "更新失败" }, { status: 500 });
  }
}
