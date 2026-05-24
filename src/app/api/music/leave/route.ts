import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

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

    // Clean up user's votes and mark their songs as played
    await prisma.skipVote.deleteMany({ where: { userId: user.id } });
    await prisma.userSong.updateMany({
      where: { userId: user.id, played: false },
      data: { played: true },
    });

    // If no users left, stop playback immediately
    if (updated.length === 0) {
      await prisma.musicState.update({
        where: { id: "singleton" },
        data: { currentSong: null, currentUserSongId: null, isPlaying: false, position: 0 },
      });
    }

    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "离开失败" }, { status: 500 });
  }
}
