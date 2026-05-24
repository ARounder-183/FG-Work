import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function POST() {
  try {
    const user = await requireAuth();
    const state = await prisma.musicState.findUnique({ where: { id: "singleton" } });
    if (!state || !state.currentSong || !state.currentUserSongId) return Response.json({ error: "没有正在播放的歌曲" }, { status: 400 });

    const queueOrder: string[] = JSON.parse(state.queueOrder);
    if (!queueOrder.includes(user.id)) return Response.json({ error: "请先加入音乐室" }, { status: 400 });

    const songId = state.currentUserSongId;

    // Toggle vote
    const existing = await prisma.skipVote.findUnique({
      where: { userId_songId: { userId: user.id, songId } },
    });
    if (existing) {
      await prisma.skipVote.delete({ where: { id: existing.id } });
    } else {
      await prisma.skipVote.create({ data: { userId: user.id, songId } });
    }

    const voteCount = await prisma.skipVote.count({ where: { songId } });
    const threshold = Math.ceil(queueOrder.length / 2);

    let skipped = false;
    if (voteCount >= threshold && queueOrder.length > 0) {
      // Mark current as played
      await prisma.userSong.update({ where: { id: songId }, data: { played: true } });
      await prisma.skipVote.deleteMany({ where: { songId } });
      await advanceToNextSong();
      skipped = true;
    }

    return Response.json({ skipped, voteCount, threshold });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "投票失败" }, { status: 500 });
  }
}

async function advanceToNextSong() {
  const state = await prisma.musicState.findUnique({ where: { id: "singleton" } });
  if (!state) return;

  const queueOrder: string[] = JSON.parse(state.queueOrder);
  if (queueOrder.length === 0) {
    await prisma.musicState.update({
      where: { id: "singleton" },
      data: { currentSong: null, currentUserSongId: null, isPlaying: false, position: 0 },
    });
    return;
  }

  // Find next unplayed song (already ordered by sortOrder globally)
  const next = await prisma.userSong.findFirst({
    where: { played: false },
    orderBy: { sortOrder: "asc" },
  });

  if (next) {
    const song = JSON.parse(next.songData);
    await prisma.musicState.update({
      where: { id: "singleton" },
      data: { currentSong: JSON.stringify(song), currentUserSongId: next.id, isPlaying: true, position: 0 },
    });
  } else {
    // All songs played, advance round
    await prisma.userSong.updateMany({ data: { played: false } });
    await prisma.musicState.update({
      where: { id: "singleton" },
      data: { currentRound: state.currentRound + 1, currentSong: null, currentUserSongId: null, isPlaying: false, position: 0 },
    });

    // Try again
    const first = await prisma.userSong.findFirst({
      where: { played: false },
      orderBy: { sortOrder: "asc" },
    });
    if (first) {
      const song = JSON.parse(first.songData);
      await prisma.musicState.update({
        where: { id: "singleton" },
        data: { currentSong: JSON.stringify(song), currentUserSongId: first.id, isPlaying: true, position: 0 },
      });
    }
  }
}
