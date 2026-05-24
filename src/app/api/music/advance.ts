import { prisma } from "@/lib/prisma";

/** Find the next song to play using round-robin by user order */
export async function advanceToNextSong(currentUserId: string | null) {
  const state = await prisma.musicState.findUnique({ where: { id: "singleton" } });
  if (!state) return;

  // Mark current as played
  if (currentUserId && state.currentUserSongId) {
    await prisma.userSong.updateMany({
      where: { id: state.currentUserSongId, played: false },
      data: { played: true },
    });
    await prisma.skipVote.deleteMany({ where: { songId: state.currentUserSongId } });
  }

  const queueOrder: string[] = JSON.parse(state.queueOrder);
  if (queueOrder.length === 0) {
    await prisma.musicState.update({
      where: { id: "singleton" },
      data: { currentSong: null, currentUserSongId: null, isPlaying: false, position: 0 },
    });
    return;
  }

  // Find next user in queueOrder after currentUserId
  let startIdx = currentUserId ? queueOrder.indexOf(currentUserId) : -1;
  if (startIdx < 0) startIdx = queueOrder.length - 1; // start from last so next is first

  // Try each user in round-robin order
  for (let i = 1; i <= queueOrder.length; i++) {
    const idx = (startIdx + i) % queueOrder.length;
    const userId = queueOrder[idx];
    const song = await prisma.userSong.findFirst({
      where: { userId, played: false },
      orderBy: { sortOrder: "asc" },
    });
    if (song) {
      await prisma.musicState.update({
        where: { id: "singleton" },
        data: {
          currentSong: song.songData,
          currentUserSongId: song.id,
          isPlaying: true,
          position: 0,
        },
      });
      return;
    }
  }

  // No user has songs → reset all and start over
  await prisma.userSong.updateMany({ where: { played: true, userId: { in: queueOrder } }, data: { played: false } });
  const firstSong = await prisma.userSong.findFirst({
    where: { played: false, userId: { in: queueOrder } },
    orderBy: { sortOrder: "asc" },
  });
  if (firstSong) {
    await prisma.musicState.update({
      where: { id: "singleton" },
      data: {
        currentSong: firstSong.songData,
        currentUserSongId: firstSong.id,
        isPlaying: true,
        position: 0,
        currentRound: state.currentRound + 1,
      },
    });
  } else {
    await prisma.musicState.update({
      where: { id: "singleton" },
      data: { currentSong: null, currentUserSongId: null, isPlaying: false, position: 0 },
    });
  }
}
