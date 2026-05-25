import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { advanceToNextSong, stopTimer } from "@/lib/music-server";

export async function GET() {
  try {
    await requireAdmin();
    const state = await prisma.musicState.findUnique({ where: { id: "singleton" } });
    const queueOrder = state ? (JSON.parse(state.queueOrder) as string[]) : [];

    const songs = await prisma.userSong.findMany({
      where: { userId: { in: queueOrder } },
      orderBy: { sortOrder: "asc" },
      include: { user: { select: { id: true, username: true } } },
    });

    return Response.json({
      currentSong: state?.currentSong ? JSON.parse(state.currentSong) : null,
      isPlaying: state?.isPlaying ?? false,
      queueOrder,
      songs,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "获取失败" }, { status: 500 });
  }
}

export async function POST() {
  try {
    await requireAdmin();
    await advanceToNextSong();
    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "切歌失败" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await requireAdmin();
    await prisma.userSong.deleteMany();
    await prisma.musicState.update({
      where: { id: "singleton" },
      data: { currentSong: null, currentUserSongId: null, isPlaying: false, position: 0, startedAt: null, queueOrder: "[]", currentTurnIndex: 0 },
    });
    stopTimer();
    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "清空失败" }, { status: 500 });
  }
}
