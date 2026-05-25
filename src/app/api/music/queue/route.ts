import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireAuth();
    const songs = await prisma.userSong.findMany({
      where: { userId: user.id },
      orderBy: { sortOrder: "asc" },
    });
    return Response.json({ songs });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "获取失败" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { song, songs: songList } = await req.json();

    const toAdd = songList || (song ? [song] : []);
    if (toAdd.length === 0) return Response.json({ error: "请选择歌曲" }, { status: 400 });

    const maxOrder = await prisma.userSong.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let nextOrder = (maxOrder?.sortOrder ?? -1) + 1;

    for (const s of toAdd) {
      await prisma.userSong.create({
        data: {
          songData: JSON.stringify(s),
          userId: user.id,
          sortOrder: nextOrder++,
        },
      });
    }

    return Response.json({ success: true, count: toAdd.length }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "添加失败" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { songs } = await req.json();
    if (!Array.isArray(songs)) return Response.json({ error: "格式错误" }, { status: 400 });

    for (const s of songs) {
      await prisma.userSong.updateMany({
        where: { id: s.id, userId: user.id },
        data: { sortOrder: s.sortOrder },
      });
    }
    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "更新失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const all = searchParams.get("all");
    const id = searchParams.get("id");

    if (all === "true") {
      await prisma.userSong.deleteMany({ where: { userId: user.id } });
    } else if (id) {
      await prisma.userSong.deleteMany({ where: { id, userId: user.id } });
    }

    // 如果没有任何未播放歌曲，清除播放
    const remaining = await prisma.userSong.count({ where: { played: false } });
    if (remaining === 0) {
      await prisma.musicState.update({
        where: { id: "singleton" },
        data: { currentSong: null, currentUserSongId: null, isPlaying: false, position: 0, startedAt: null },
      });
    }
    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "删除失败" }, { status: 500 });
  }
}
