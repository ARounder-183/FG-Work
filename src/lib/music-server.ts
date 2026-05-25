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

    const song = safeParseJson(state.currentSong) as { duration?: number } | null;
    if (!song) return;
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
//  切歌逻辑（currentTurnIndex 驱动）
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

  // 标记当前歌曲已播放（如果存在）
  if (state.currentUserSongId) {
    await prisma.userSong.updateMany({
      where: { id: state.currentUserSongId, played: false },
      data: { played: true },
    });
    await prisma.skipVote.deleteMany({
      where: { songId: state.currentUserSongId },
    });
  }

  const queueOrder = safeParseArray(state.queueOrder);

  // 无活跃用户 → 停止播放
  if (queueOrder.length === 0) {
    await clearPlayback();
    stopTimer();
    return;
  }

  // 从 currentTurnIndex 开始遍历队列，找下一个有歌的用户
  const turnIdx = state.currentTurnIndex % queueOrder.length;
  const played = await tryPlayNextInQueue(queueOrder, turnIdx, state.currentRound);
  if (played) return;

  // 所有用户的歌都播完 → 重置，从 queueOrder[0] 开始新一轮
  await prisma.userSong.updateMany({
    where: { played: true, userId: { in: queueOrder } },
    data: { played: false },
  });

  const restarted = await tryPlayNextInQueue(queueOrder, 0, state.currentRound + 1);
  if (restarted) return;

  // 完全无歌可播
  await clearPlayback();
  stopTimer();
}

// ════════════════════════════════════════════════════════════════════
//  内部工具
// ════════════════════════════════════════════════════════════════════

/**
 * 从 startIdx 开始遍历 queueOrder，找到第一个有有效歌曲的用户，播放之。
 * 返回 true 表示成功播放，false 表示无人有歌。
 */
async function tryPlayNextInQueue(
  queueOrder: string[],
  startIdx: number,
  round: number,
): Promise<boolean> {
  for (let i = 0; i < queueOrder.length; i++) {
    const idx = (startIdx + i) % queueOrder.length;
    const userId = queueOrder[idx];
    const song = await prisma.userSong.findFirst({
      where: { userId, played: false },
      orderBy: { sortOrder: "asc" },
    });
    if (!song) continue;

    const songData = safeParseJson(song.songData) as { id: number; duration: number } | null;
    if (!songData) {
      await markSongPlayed(song.id);
      continue;
    }
    const urlValid = await validateSongUrl(songData.id);
    if (!urlValid) {
      await markSongPlayed(song.id);
      continue;
    }

    // 成功 → 设置当前歌曲，轮转指针指向下一位
    const nextTurnIdx = (idx + 1) % queueOrder.length;
    await setCurrentSong(song, songData, round, nextTurnIdx);
    return true;
  }
  return false;
}

async function setCurrentSong(
  song: { id: string; songData: string },
  songData: { duration: number },
  round: number,
  nextTurnIdx: number,
): Promise<void> {
  await prisma.musicState.update({
    where: { id: "singleton" },
    data: {
      currentSong: song.songData,
      currentUserSongId: song.id,
      isPlaying: true,
      position: 0,
      currentRound: round,
      currentTurnIndex: nextTurnIdx,
      startedAt: new Date(),
      lastAdvanceAt: new Date(),
    },
  });
  ensureTimerRunning();
}

async function markSongPlayed(songId: string): Promise<void> {
  await prisma.userSong.updateMany({
    where: { id: songId, played: false },
    data: { played: true },
  });
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

// ════════════════════════════════════════════════════════════════════
//  安全解析工具
// ════════════════════════════════════════════════════════════════════

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
