import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { advanceToNextSong, ensureTimerRunning, getCurrentPosition } from "@/lib/music-server";

export async function GET() {
  try {
    let state = await prisma.musicState.findUnique({ where: { id: "singleton" } });
    if (!state) state = await prisma.musicState.create({ data: { id: "singleton" } });

    const queueOrder: string[] = safeParseArray(state.queueOrder);

    // ── 心跳：更新当前用户 lastSeenAt，踢出超时用户 ──────────────────
    const currentUser = await getCurrentUser();
    if (currentUser) {
      await prisma.user.update({
        where: { id: currentUser.id },
        data: { lastSeenAt: new Date() },
      });
    }

    if (queueOrder.length > 0) {
      const staleThreshold = new Date(Date.now() - 15_000);
      const activeUserIds = await prisma.user.findMany({
        where: { id: { in: queueOrder }, lastSeenAt: { gte: staleThreshold } },
        select: { id: true },
      });
      const activeSet = new Set(activeUserIds.map((u) => u.id));

      const stale = queueOrder.filter((id) => !activeSet.has(id));
      if (stale.length > 0) {
        // Remove stale users from queue
        const updatedOrder = queueOrder.filter((id) => activeSet.has(id));
        await prisma.musicState.update({
          where: { id: "singleton" },
          data: {
            queueOrder: JSON.stringify(updatedOrder),
            currentTurnIndex: updatedOrder.length > 0 ? state.currentTurnIndex % updatedOrder.length : 0,
          },
        });

        // Mark their songs as played and clear votes
        await prisma.userSong.updateMany({
          where: { userId: { in: stale }, played: false },
          data: { played: true },
        });
        await prisma.skipVote.deleteMany({ where: { userId: { in: stale } } });

        // Refresh state after cleanup
        state = (await prisma.musicState.findUnique({ where: { id: "singleton" } }))!;
        // Re-parse queueOrder after cleanup
        const newOrder = safeParseArray(state.queueOrder);
        // Replace queueOrder reference for rest of handler
        queueOrder.length = 0;
        queueOrder.push(...newOrder);
      }
    }

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
      where: {
        played: false,
        ...(queueOrder.length > 0 ? { userId: { in: queueOrder } } : {}),
      },
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

    const currentSong = safeParseJson(state.currentSong);

    // 服务端计算 position
    const position = await getCurrentPosition();

    // 用户列表：按队列顺序排序
    const dbUsers = await prisma.user.findMany({
      where: { id: { in: queueOrder } },
      select: { id: true, username: true, avatar: true },
    });
    const userMap = new Map(dbUsers.map((u) => [u.id, u]));
    const users = queueOrder.map((id) => userMap.get(id)).filter(Boolean) as Array<{ id: string; username: string; avatar: string | null }>;

    let skipVotes: string[] = [];
    if (currentUserSong) {
      const votes = await prisma.skipVote.findMany({
        where: { songId: currentUserSong.id },
        select: { userId: true },
      });
      skipVotes = votes.map((v) => v.userId);
    }

    // 全局队列：先按用户在 queueOrder 中的顺序，再按歌曲 sortOrder
    const allSongs = await prisma.userSong.findMany({
      where: { played: false, userId: { in: queueOrder } },
      orderBy: { sortOrder: "asc" },
      include: { user: { select: { id: true, username: true, avatar: true } } },
    });
    const userRank = new Map(queueOrder.map((id, i) => [id, i]));
    const fullQueue = allSongs.sort((a, b) => {
      const rankA = userRank.get(a.userId) ?? 99;
      const rankB = userRank.get(b.userId) ?? 99;
      if (rankA !== rankB) return rankA - rankB;
      return a.sortOrder - b.sortOrder;
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
  } catch (error) {
    console.error("[Music State GET]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
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

// ── helpers ──────────────────────────────────────────────────────────

function safeParseArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeParseJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
