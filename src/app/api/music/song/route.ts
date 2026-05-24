import { NextRequest } from "next/server";
import { getSongUrl } from "@/lib/ncm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "请输入歌曲 ID" }, { status: 400 });

  const rawUrl = await getSongUrl(id);
  const url = rawUrl ? rawUrl.replace(/^http:/, "https:") : null;
  if (!url) {
    console.log(`[NCM] No URL found for song ${id}`);
  }
  return Response.json({ url });
}
