import { NextRequest } from "next/server";
import { searchSongs, searchPlaylists } from "@/lib/ncm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const keywords = searchParams.get("q");
  const type = searchParams.get("type") || "song";
  const offset = parseInt(searchParams.get("offset") || "0");
  const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 50);

  if (!keywords) return Response.json({ error: "请输入搜索关键词" }, { status: 400 });

  if (type === "playlist") {
    // Request extra to detect hasMore
    const all = await searchPlaylists(keywords, offset + limit + 1);
    const page = all.slice(offset, offset + limit);
    return Response.json({
      playlists: page,
      hasMore: all.length > offset + limit,
      nextOffset: offset + limit,
    });
  }

  const all = await searchSongs(keywords, offset + limit + 1);
  const page = all.slice(offset, offset + limit);
  return Response.json({
    songs: page,
    hasMore: all.length > offset + limit,
    nextOffset: offset + limit,
  });
}
