import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  let state = await prisma.musicState.findUnique({ where: { id: "singleton" } });
  if (!state) state = await prisma.musicState.create({ data: { id: "singleton" } });

  const queueOrder: string[] = JSON.parse(state.queueOrder);

  // No active users → clear playback
  if (queueOrder.length === 0 && state.currentSong) {
    state = await prisma.musicState.update({
      where: { id: "singleton" },
      data: { currentSong: null, currentUserSongId: null, isPlaying: false, position: 0 },
    });
  }

  // Check if we have unplayed songs
  const unplayedCount = await prisma.userSong.count({ where: { played: false } });

  // Nothing to play → clear playback
  if (unplayedCount === 0 && state.currentSong) {
    state = await prisma.musicState.update({
      where: { id: "singleton" },
      data: { currentSong: null, currentUserSongId: null, isPlaying: false, position: 0 },
    });
  }

  // If nothing is playing and there are active users with songs, auto-start
  if (!state.currentSong && unplayedCount > 0 && queueOrder.length > 0) {
    const first = await prisma.userSong.findFirst({
      where: { played: false },
      orderBy: { sortOrder: "asc" },
    });
    if (first) {
      const song = JSON.parse(first.songData);
      state = await prisma.musicState.update({
        where: { id: "singleton" },
        data: { currentSong: JSON.stringify(song), currentUserSongId: first.id, isPlaying: true, position: 0 },
      });
    }
  }

  // If playing but currentUserSongId is missing, repair it
  if (state.currentSong && !state.currentUserSongId) {
    const current = await prisma.userSong.findFirst({
      where: { played: false },
      orderBy: { sortOrder: "asc" },
    });
    if (current) {
      state = await prisma.musicState.update({
        where: { id: "singleton" },
        data: { currentUserSongId: current.id },
      });
    }
  }

  // Sort users by whose song plays next (first unplayed song's sortOrder)
  const userSongOrder = await prisma.userSong.findMany({
    where: { played: false },
    orderBy: { sortOrder: "asc" },
    select: { userId: true, sortOrder: true },
  });
  const userOrderMap = new Map<string, number>();
  userSongOrder.forEach((s) => { if (!userOrderMap.has(s.userId)) userOrderMap.set(s.userId, s.sortOrder); });

  const users = (await prisma.user.findMany({
    where: { id: { in: queueOrder } },
    select: { id: true, username: true, avatar: true },
  })).sort((a, b) => {
    const aOrder = userOrderMap.get(a.id) ?? 999999;
    const bOrder = userOrderMap.get(b.id) ?? 999999;
    return aOrder - bOrder;
  });

  // Find current user's turn
  let currentSong = state.currentSong ? JSON.parse(state.currentSong) : null;
  let currentUserSong: { id: string; userId: string; user: { username: string; avatar: string | null } } | null = null;

  if (currentSong) {
    const songs = await prisma.userSong.findMany({
      where: { played: false },
      orderBy: { sortOrder: "asc" },
      include: { user: { select: { id: true, username: true, avatar: true } } },
    });
    // First unplayed song is current
    currentUserSong = songs[0] || null;
  }

  // Skip votes
  let skipVotes: string[] = [];
  if (currentUserSong) {
    const votes = await prisma.skipVote.findMany({
      where: { songId: currentUserSong.id },
      select: { userId: true },
    });
    skipVotes = votes.map((v) => v.userId);
  }

  // Full global queue
  const fullQueue = await prisma.userSong.findMany({
    where: { played: false },
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
      // Find the current song ID if not already set
      let songId = state.currentUserSongId;
      if (!songId) {
        const current = await prisma.userSong.findFirst({
          where: { played: false },
          orderBy: { sortOrder: "asc" },
        });
        if (current) songId = current.id;
      }

      if (songId) {
        const stillCurrent = await prisma.userSong.findFirst({
          where: { id: songId, played: false },
        });
        if (stillCurrent) {
          await prisma.userSong.update({ where: { id: songId }, data: { played: true } });
          await prisma.skipVote.deleteMany({ where: { songId } });
        }
      }

      const next = await prisma.userSong.findFirst({
        where: { played: false },
        orderBy: { sortOrder: "asc" },
      });

      if (next) {
        const song = JSON.parse(next.songData);
        updateData.currentSong = JSON.stringify(song);
        updateData.currentUserSongId = next.id;
        updateData.isPlaying = true;
        updateData.position = 0;
      } else {
        await prisma.userSong.updateMany({ data: { played: false } });
        state = await prisma.musicState.findUnique({ where: { id: "singleton" } });
        updateData.currentRound = (state?.currentRound || 1) + 1;
        const first = await prisma.userSong.findFirst({
          where: { played: false },
          orderBy: { sortOrder: "asc" },
        });
        if (first) {
          const song = JSON.parse(first.songData);
          updateData.currentSong = JSON.stringify(song);
          updateData.currentUserSongId = first.id;
          updateData.isPlaying = true;
          updateData.position = 0;
        } else {
          updateData.currentSong = null;
          updateData.currentUserSongId = null;
          updateData.isPlaying = false;
          updateData.position = 0;
        }
      }
    }

    await prisma.musicState.update({ where: { id: "singleton" }, data: updateData });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "更新失败" }, { status: 500 });
  }
}
