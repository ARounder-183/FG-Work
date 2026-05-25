import { NextRequest } from "next/server";
import { getLyric } from "@/lib/ncm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const source = searchParams.get("source") || "ncm";

  // Bilibili has no public lyric API
  if (source === "bilibili") {
    return Response.json({ lyric: null });
  }

  if (!id) return Response.json({ error: "缺少 ID" }, { status: 400 });

  const lyric = await getLyric(id);
  return Response.json({ lyric });
}
