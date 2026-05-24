import { NextRequest } from "next/server";
import { searchSongs, searchPlaylists } from "@/lib/ncm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const keywords = searchParams.get("q");
  const type = searchParams.get("type") || "song";
  const offset = parseInt(searchParams.get("offset") || "0");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 50);

  if (!keywords) return Response.json({ error: "请输入搜索关键词" }, { status: 400 });

  if (type === "playlist") {
    const playlists = await searchPlaylists(keywords, limit + offset);
    const hasMore = playlists.length > limit + offset;
    return Response.json({ playlists: playlists.slice(offset, offset + limit), hasMore, nextOffset: offset + limit });
  }

  const songs = await searchSongs(keywords, limit + offset);
  const hasMore = songs.length > limit + offset;
  return Response.json({ songs: songs.slice(offset, offset + limit), hasMore, nextOffset: offset + limit });
}
