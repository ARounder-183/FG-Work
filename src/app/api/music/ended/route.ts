import { prisma } from "@/lib/prisma";
import { advanceToNextSong } from "@/lib/music-server";

function safeParseJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function POST() {
  try {
    const state = await prisma.musicState.findUnique({ where: { id: "singleton" } });
    if (!state || !state.currentSong || !state.currentUserSongId) {
      return Response.json({ advanced: false });
    }

    const song = safeParseJson(state.currentSong) as { duration?: number } | null;
    const duration = song?.duration || 0;
    const startedAt = state.startedAt ? new Date(state.startedAt).getTime() : 0;
    const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;

    if (duration > 0 && elapsed < duration * 0.9) {
      return Response.json({ advanced: false });
    }

    await advanceToNextSong();
    return Response.json({ advanced: true });
  } catch {
    return Response.json({ error: "切歌失败" }, { status: 500 });
  }
}
