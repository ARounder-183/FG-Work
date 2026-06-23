import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { advanceToNextSong, stopTimer } from "@/lib/music-server";

export async function POST() {
  try {
    const user = await requireAuth();
    const state = await prisma.musicState.findUnique({ where: { id: "singleton" } });
    if (!state) return Response.json({ success: true });

    const queueOrder = safeParseArray(state.queueOrder);
    const updated = queueOrder.filter((id) => id !== user.id);

    // 修正 currentTurnIndex：移除用户后可能越界
    let currentTurnIndex = state.currentTurnIndex;
    if (updated.length > 0) {
      currentTurnIndex = currentTurnIndex % updated.length;
    } else {
      currentTurnIndex = 0;
    }

    await prisma.musicState.update({
      where: { id: "singleton" },
      data: {
        queueOrder: JSON.stringify(updated),
        currentTurnIndex,
      },
    });

    // 清理该用户的投票和歌曲
    await prisma.skipVote.deleteMany({ where: { userId: user.id } });
    await prisma.userSong.updateMany({
      where: { userId: user.id, played: false },
      data: { played: true },
    });

    const currentSong = state.currentUserSongId
      ? await prisma.userSong.findUnique({
          where: { id: state.currentUserSongId },
          select: { userId: true },
        })
      : null;

    // 无人时停止时钟并清除播放
    if (updated.length === 0) {
      stopTimer();
      await prisma.musicState.update({
        where: { id: "singleton" },
        data: { currentSong: null, currentUserSongId: null, isPlaying: false, position: 0, startedAt: null },
      });
    } else if (currentSong?.userId === user.id) {
      await advanceToNextSong();
    }

    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "离开失败" }, { status: 500 });
  }
}

function safeParseArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
