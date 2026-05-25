import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  try {
    await requireAdmin();

    const [userCount, postCount, commentCount, chatCount, musicState] = await Promise.all([
      prisma.user.count(),
      prisma.post.count(),
      prisma.comment.count(),
      prisma.chatMessage.count(),
      prisma.musicState.findUnique({ where: { id: "singleton" } }),
    ]);

    return Response.json({
      stats: {
        users: userCount,
        posts: postCount,
        comments: commentCount,
        chatMessages: chatCount,
        activeInMusic: musicState
          ? (JSON.parse(musicState.queueOrder) as string[]).length
          : 0,
        hasCurrentSong: !!musicState?.currentSong,
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "获取失败" }, { status: 500 });
  }
}
