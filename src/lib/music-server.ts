// ─── 服务端播放时钟 + 切歌逻辑（单例） ──────────────────────────────

import { prisma } from "./prisma";
import { getSongUrl } from "./ncm";

// ════════════════════════════════════════════════════════════════════
//  播放时钟（内存定时器）
// ════════════════════════════════════════════════════════════════════

const TICK_MS = 500;
const ADVANCE_COOLDOWN_MS = 1000;

let timerInterval: ReturnType<typeof setInterval> | null = null;

export function ensureTimerRunning(): void {
  if (timerInterval) return;
  timerInterval = setInterval(tick, TICK_MS);
}

export function stopTimer(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

async function tick(): Promise<void> {
  try {
    const state = await prisma.musicState.findUnique({
      where: { id: "singleton" },
    });
    if (!state || !state.currentSong || !state.isPlaying) return;

    const song = JSON.parse(state.currentSong) as { duration?: number };
    const duration = song.duration || 0;
    const startedAt = state.startedAt ? new Date(state.startedAt).getTime() : 0;
    if (duration <= 0 || !startedAt) return;

    const elapsed = (Date.now() - startedAt) / 1000;
    if (elapsed >= duration) {
      await advanceToNextSong();
    }
  } catch {
    // 静默处理：tick 不应因任何错误而停止
  }
}

// ════════════════════════════════════════════════════════════════════
//  切歌逻辑
// ════════════════════════════════════════════════════════════════════

export async function advanceToNextSong(): Promise<void> {
  const state = await prisma.musicState.findUnique({
    where: { id: "singleton" },
  });
  if (!state) return;

  // 防抖：1 秒内不重复切歌
  if (state.lastAdvanceAt) {
    const msSince = Date.now() - new Date(state.lastAdvanceAt).getTime();
    if (msSince < ADVANCE_COOLDOWN_MS) return;
  }

  // 推导当前歌曲的 userId
  let currentUserId: string | null = null;
  if (state.currentUserSongId) {
    const song = await prisma.userSong.findUnique({
      where: { id: state.currentUserSongId },
      select: { userId: true },
    });
    currentUserId = song?.userId || null;
  }

  // 标记当前歌曲已播放
  if (currentUserId && state.currentUserSongId) {
    await prisma.userSong.updateMany({
      where: { id: state.currentUserSongId, played: false },
      data: { played: true },
    });
    await prisma.skipVote.deleteMany({
      where: { songId: state.currentUserSongId },
    });
  }

  const queueOrder: string[] = JSON.parse(state.queueOrder);

  // 无活跃用户 → 停止播放
  if (queueOrder.length === 0) {
    await clearPlayback();
    stopTimer();
    return;
  }

  // Round-robin：从当前用户的下一位开始找未播放的歌
  let startIdx = currentUserId ? queueOrder.indexOf(currentUserId) : -1;
  if (startIdx < 0) startIdx = queueOrder.length - 1;

  for (let i = 1; i <= queueOrder.length; i++) {
    const idx = (startIdx + i) % queueOrder.length;
    const userId = queueOrder[idx];
    const song = await prisma.userSong.findFirst({
      where: { userId, played: false },
      orderBy: { sortOrder: "asc" },
    });
    if (song) {
      const songData = JSON.parse(song.songData) as { id: number; duration: number };
      const urlValid = await validateSongUrl(songData.id);
      if (urlValid) {
        await setCurrentSong(song, songData, state.currentRound);
        return;
      }
      // URL 不可用 → 标记已播放，继续找下一个
      await prisma.userSong.updateMany({
        where: { id: song.id, played: false },
        data: { played: true },
      });
    }
  }

  // 所有用户的歌都播完 → 重置并开始下一轮
  await prisma.userSong.updateMany({
    where: { played: true, userId: { in: queueOrder } },
    data: { played: false },
  });

  const firstSong = await prisma.userSong.findFirst({
    where: { played: false, userId: { in: queueOrder } },
    orderBy: { sortOrder: "asc" },
  });

  if (firstSong) {
    const songData = JSON.parse(firstSong.songData) as {
      id: number;
      duration: number;
    };
    const urlValid = await validateSongUrl(songData.id);
    if (urlValid) {
      await setCurrentSong(firstSong, songData, state.currentRound + 1);
      return;
    }
    // URL 不可用 → 标记并递归
    await prisma.userSong.updateMany({
      where: { id: firstSong.id },
      data: { played: true },
    });
    // 递归重试（最多额外尝试一次，避免无限循环）
    return advanceToNextSong();
  }

  // 完全无歌可播
  await clearPlayback();
  stopTimer();
}

// ════════════════════════════════════════════════════════════════════
//  内部工具
// ════════════════════════════════════════════════════════════════════

async function setCurrentSong(
  song: { id: string; songData: string },
  songData: { duration: number },
  round: number,
): Promise<void> {
  await prisma.musicState.update({
    where: { id: "singleton" },
    data: {
      currentSong: song.songData,
      currentUserSongId: song.id,
      isPlaying: true,
      position: 0,
      currentRound: round,
      startedAt: new Date(),
      lastAdvanceAt: new Date(),
    },
  });
  ensureTimerRunning();
}

async function clearPlayback(): Promise<void> {
  await prisma.musicState.update({
    where: { id: "singleton" },
    data: {
      currentSong: null,
      currentUserSongId: null,
      isPlaying: false,
      position: 0,
      startedAt: null,
      lastAdvanceAt: new Date(),
    },
  });
}

async function validateSongUrl(songId: number): Promise<boolean> {
  try {
    const url = await getSongUrl(String(songId));
    return url !== null && url.length > 0;
  } catch {
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════
//  状态查询辅助
// ════════════════════════════════════════════════════════════════════

/** 获取当前播放位置（秒），由服务端根据 startedAt 计算 */
export async function getCurrentPosition(): Promise<number> {
  const state = await prisma.musicState.findUnique({
    where: { id: "singleton" },
  });
  if (!state || !state.isPlaying || !state.startedAt) {
    return state?.position || 0;
  }
  const elapsed = Math.floor(
    (Date.now() - new Date(state.startedAt).getTime()) / 1000,
  );
  return Math.max(0, elapsed);
}
