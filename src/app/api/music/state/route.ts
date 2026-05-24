import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

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

  // No unplayed songs → clear
  const unplayedCount = await prisma.userSong.count({ where: { played: false } });
  if (unplayedCount === 0 && state.currentSong) {
    state = await prisma.musicState.update({
      where: { id: "singleton" },
      data: { currentSong: null, currentUserSongId: null, isPlaying: false, position: 0 },
    });
  }

  // Auto-start if idle
  if (!state.currentSong && unplayedCount > 0 && queueOrder.length > 0) {
    const first = await prisma.userSong.findFirst({
      where: { played: false },
      orderBy: { sortOrder: "asc" },
    });
    if (first) {
      state = await prisma.musicState.update({
        where: { id: "singleton" },
        data: { currentSong: JSON.stringify(first.songData), currentUserSongId: first.id, isPlaying: true, position: 0 },
      });
    }
  }

  // === Single source of truth: derive everything from currentUserSongId ===

  // Find the actual current song by its ID
  let currentUserSong: { id: string; userId: string; user: { username: string; avatar: string | null } } | null = null;
  if (state.currentUserSongId) {
    currentUserSong = await prisma.userSong.findUnique({
      where: { id: state.currentUserSongId },
      include: { user: { select: { id: true, username: true, avatar: true } } },
    });
  }

  // If currentUserSongId points to a played/deleted song, fix it
  if (!currentUserSong && state.currentSong) {
    const first = await prisma.userSong.findFirst({
      where: { played: false },
      orderBy: { sortOrder: "asc" },
      include: { user: { select: { id: true, username: true, avatar: true } } },
    });
    if (first) {
      state = await prisma.musicState.update({
        where: { id: "singleton" },
        data: { currentSong: first.songData, currentUserSongId: first.id, isPlaying: true, position: 0 },
      });
      currentUserSong = first;
    } else {
      state = await prisma.musicState.update({
        where: { id: "singleton" },
        data: { currentSong: null, currentUserSongId: null, isPlaying: false, position: 0 },
      });
    }
  }

  const currentSong = state.currentSong ? JSON.parse(state.currentSong) : null;

  // Users sorted by their first song's sortOrder
  const userSongs = await prisma.userSong.findMany({
    where: { played: false },
    orderBy: { sortOrder: "asc" },
    select: { userId: true, sortOrder: true },
  });
  const userOrder = new Map<string, number>();
  userSongs.forEach((s) => { if (!userOrder.has(s.userId)) userOrder.set(s.userId, s.sortOrder); });

  const users = (await prisma.user.findMany({
    where: { id: { in: queueOrder } },
    select: { id: true, username: true, avatar: true },
  })).sort((a, b) => (userOrder.get(a.id) ?? 999999) - (userOrder.get(b.id) ?? 999999));

  // Skip votes (tied to current song)
  let skipVotes: string[] = [];
  if (currentUserSong) {
    const votes = await prisma.skipVote.findMany({
      where: { songId: currentUserSong.id },
      select: { userId: true },
    });
    skipVotes = votes.map((v) => v.userId);
  }

  // Full queue
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
      // Mark current as played using the ID from state
      if (state.currentUserSongId) {
        await prisma.userSong.updateMany({
          where: { id: state.currentUserSongId, played: false },
          data: { played: true },
        });
        await prisma.skipVote.deleteMany({ where: { songId: state.currentUserSongId } });
      }

      const next = await prisma.userSong.findFirst({
        where: { played: false },
        orderBy: { sortOrder: "asc" },
      });

      if (next) {
        updateData.currentSong = next.songData;
        updateData.currentUserSongId = next.id;
        updateData.isPlaying = true;
        updateData.position = 0;
      } else {
        // Reset round
        await prisma.userSong.updateMany({ data: { played: false } });
        const first = await prisma.userSong.findFirst({
          where: { played: false },
          orderBy: { sortOrder: "asc" },
        });
        if (first) {
          updateData.currentSong = first.songData;
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
