import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { stopTimer } from "@/lib/music-server";

export async function POST() {
  try {
    const user = await requireAuth();
    const state = await prisma.musicState.findUnique({ where: { id: "singleton" } });
    if (!state) return Response.json({ success: true });

    const queueOrder: string[] = JSON.parse(state.queueOrder);
    const updated = queueOrder.filter((id) => id !== user.id);

    await prisma.musicState.update({
      where: { id: "singleton" },
      data: { queueOrder: JSON.stringify(updated) },
    });

    // 清理该用户的投票和歌曲
    await prisma.skipVote.deleteMany({ where: { userId: user.id } });
    await prisma.userSong.updateMany({
      where: { userId: user.id, played: false },
      data: { played: true },
    });

    // 无人时停止时钟并清除播放
    if (updated.length === 0) {
      stopTimer();
      await prisma.musicState.update({
        where: { id: "singleton" },
        data: { currentSong: null, currentUserSongId: null, isPlaying: false, position: 0, startedAt: null },
      });
    }

    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "离开失败" }, { status: 500 });
  }
}
