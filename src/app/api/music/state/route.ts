import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { advanceToNextSong, ensureTimerRunning, getCurrentPosition } from "@/lib/music-server";

export async function GET() {
  let state = await prisma.musicState.findUnique({ where: { id: "singleton" } });
  if (!state) state = await prisma.musicState.create({ data: { id: "singleton" } });

  const queueOrder: string[] = JSON.parse(state.queueOrder);

  // 无活跃用户 → 清除播放
  if (queueOrder.length === 0 && state.currentSong) {
    state = await prisma.musicState.update({
      where: { id: "singleton" },
      data: { currentSong: null, currentUserSongId: null, isPlaying: false, position: 0, startedAt: null },
    });
  }

  // 清理已离开用户的歌曲
  if (queueOrder.length > 0) {
    await prisma.userSong.updateMany({
      where: { played: false, userId: { notIn: queueOrder } },
      data: { played: true },
    });
  }

  // 空闲但有歌 → 自动开始
  const unplayedCount = await prisma.userSong.count({
    where: { played: false, userId: { in: queueOrder.length > 0 ? queueOrder : undefined } },
  });

  if (!state.currentSong && unplayedCount > 0 && queueOrder.length > 0) {
    await advanceToNextSong();
    state = (await prisma.musicState.findUnique({ where: { id: "singleton" } }))!;
  }

  if (unplayedCount === 0 && state.currentSong) {
    state = await prisma.musicState.update({
      where: { id: "singleton" },
      data: { currentSong: null, currentUserSongId: null, isPlaying: false, position: 0, startedAt: null },
    });
  }

  // 当前歌曲所属用户
  let currentUserSong: { id: string; userId: string; user: { username: string; avatar: string | null } } | null = null;
  if (state.currentUserSongId) {
    currentUserSong = await prisma.userSong.findUnique({
      where: { id: state.currentUserSongId },
      include: { user: { select: { id: true, username: true, avatar: true } } },
    });
  }

  // 修复悬空指针
  if (!currentUserSong && state.currentSong) {
    await advanceToNextSong();
    state = (await prisma.musicState.findUnique({ where: { id: "singleton" } }))!;
    if (state.currentUserSongId) {
      currentUserSong = await prisma.userSong.findUnique({
        where: { id: state.currentUserSongId },
        include: { user: { select: { id: true, username: true, avatar: true } } },
      });
    }
  }

  const currentSong = state.currentSong ? JSON.parse(state.currentSong) : null;

  // 服务端计算 position
  const position = await getCurrentPosition();

  const users = await prisma.user.findMany({
    where: { id: { in: queueOrder } },
    select: { id: true, username: true, avatar: true },
  });

  let skipVotes: string[] = [];
  if (currentUserSong) {
    const votes = await prisma.skipVote.findMany({
      where: { songId: currentUserSong.id },
      select: { userId: true },
    });
    skipVotes = votes.map((v) => v.userId);
  }

  const fullQueue = await prisma.userSong.findMany({
    where: { played: false, userId: { in: queueOrder } },
    orderBy: { sortOrder: "asc" },
    include: { user: { select: { id: true, username: true, avatar: true } } },
  });

  return Response.json({
    state: { ...state, currentSong, position },
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
    const { isPlaying } = await req.json();
    const state = await prisma.musicState.findUnique({ where: { id: "singleton" } });
    if (!state) return Response.json({ error: "状态不存在" }, { status: 404 });

    const updateData: Record<string, unknown> = {};
    if (isPlaying !== undefined) {
      updateData.isPlaying = isPlaying;
      if (isPlaying && !state.startedAt) {
        // 恢复播放时记录起始时间（减去已有进度）
        updateData.startedAt = new Date(Date.now() - state.position * 1000);
      }
    }

    await prisma.musicState.update({ where: { id: "singleton" }, data: updateData });

    if (isPlaying) ensureTimerRunning();

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "更新失败" }, { status: 500 });
  }
}
