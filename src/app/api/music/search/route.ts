import { NextRequest } from "next/server";
import { searchSongs, searchPlaylists } from "@/lib/ncm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const keywords = searchParams.get("q");
  const type = searchParams.get("type") || "song";

  if (!keywords) return Response.json({ error: "请输入搜索关键词" }, { status: 400 });

  if (type === "playlist") {
    const playlists = await searchPlaylists(keywords);
    return Response.json({ playlists });
  }

  const songs = await searchSongs(keywords);
  return Response.json({ songs });
}
