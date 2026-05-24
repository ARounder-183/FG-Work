import { NextRequest } from "next/server";
import { getPlaylistDetail } from "@/lib/ncm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return Response.json({ error: "请输入歌单 ID" }, { status: 400 });

  const playlist = await getPlaylistDetail(id);
  if (!playlist) return Response.json({ error: "歌单获取失败" }, { status: 404 });

  return Response.json({
    playlist: {
      name: playlist.name,
      tracks: playlist.tracks,
    },
  });
}
