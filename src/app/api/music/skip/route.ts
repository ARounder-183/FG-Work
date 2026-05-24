import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { advanceToNextSong } from "../advance";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const state = await prisma.musicState.findUnique({ where: { id: "singleton" } });
    if (!state || !state.currentSong || !state.currentUserSongId) return Response.json({ error: "没有正在播放的歌曲" }, { status: 400 });

    const queueOrder: string[] = JSON.parse(state.queueOrder);
    if (!queueOrder.includes(user.id)) return Response.json({ error: "请先加入音乐室" }, { status: 400 });

    const songId = state.currentUserSongId;
    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";

    // Force skip: only song owner
    if (force) {
      const song = await prisma.userSong.findUnique({ where: { id: songId } });
      if (!song || song.userId !== user.id) return Response.json({ error: "只有点歌人可以跳过" }, { status: 403 });

      await advanceToNextSong(song.userId);
      return Response.json({ skipped: true, force: true });
    }

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
      const song = await prisma.userSong.findUnique({ where: { id: songId }, select: { userId: true } });
      await advanceToNextSong(song?.userId || null);
      skipped = true;
    }

    return Response.json({ skipped, voteCount, threshold });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "投票失败" }, { status: 500 });
  }
}
