import { NextRequest } from "next/server";
import { searchSongs, searchPlaylists, searchDjRadios } from "@/lib/ncm";
import { searchVideos } from "@/lib/bili";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const keywords = searchParams.get("q");
  const type = searchParams.get("type") || "song";
  const source = searchParams.get("source") || "ncm";
  const offset = parseInt(searchParams.get("offset") || "0");
  const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 50);

  if (!keywords) return Response.json({ error: "请输入搜索关键词" }, { status: 400 });

  // ════════════════════════════════════════════════════════════════
  //  Bilibili search
  // ════════════════════════════════════════════════════════════════
  if (source === "bilibili") {
    // B站只有视频搜索和收藏夹（登录后），这里处理视频搜索
    if (type === "song" || type === "video") {
      const page = Math.floor(offset / 20) + 1;
      const all = await searchVideos(keywords, page);
      // B站每页固定20条
      const pageItems = all.slice(0, limit);
      return Response.json({
        songs: pageItems.map((v) => ({
          id: v.bvid,
          name: v.name,
          artists: v.artists,
          album: v.album,
          duration: v.duration,
          picUrl: v.picUrl,
          source: "bilibili",
          bvid: v.bvid,
          cid: v.cid,
        })),
        hasMore: all.length >= 20,
        nextOffset: offset + limit,
      });
    }

    // B站收藏夹列表（需要登录，type=fav）
    if (type === "fav") {
      return Response.json({
        playlists: [],
        hasMore: false,
        nextOffset: 0,
        message: "请先登录B站",
      });
    }

    return Response.json({ songs: [], hasMore: false, nextOffset: 0 });
  }

  // ════════════════════════════════════════════════════════════════
  //  NCM search (existing)
  // ════════════════════════════════════════════════════════════════
  if (type === "playlist") {
    const all = await searchPlaylists(keywords, offset + limit + 1);
    const page = all.slice(offset, offset + limit);
    return Response.json({
      playlists: page,
      hasMore: all.length > offset + limit,
      nextOffset: offset + limit,
    });
  }

  if (type === "dj") {
    const all = await searchDjRadios(keywords, offset + limit + 1);
    const page = all.slice(offset, offset + limit);
    return Response.json({
      djRadios: page,
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
