import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { ensureTimerRunning } from "@/lib/music-server";

export async function POST() {
  try {
    const user = await requireAuth();

    let state = await prisma.musicState.findUnique({ where: { id: "singleton" } });
    if (!state) {
      state = await prisma.musicState.create({ data: { id: "singleton" } });
    }

    const queueOrder = safeParseArray(state.queueOrder);
    if (!queueOrder.includes(user.id)) {
      queueOrder.push(user.id);
      await prisma.musicState.update({
        where: { id: "singleton" },
        data: { queueOrder: JSON.stringify(queueOrder) },
      });

      // 重新激活用户已播放的歌曲
      await prisma.userSong.updateMany({
        where: { userId: user.id, played: true },
        data: { played: false },
      });
    }

    // 有歌可播时启动服务端时钟
    const unplayedCount = await prisma.userSong.count({
      where: { played: false, userId: { in: queueOrder } },
    });
    if (unplayedCount > 0) {
      ensureTimerRunning();
    }

    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "加入失败" }, { status: 500 });
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
