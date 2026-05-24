import { NextRequest } from "next/server";
import { getDjPrograms } from "@/lib/ncm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "缺少电台 ID" }, { status: 400 });

  const songs = await getDjPrograms(id);
  return Response.json({ songs });
}
