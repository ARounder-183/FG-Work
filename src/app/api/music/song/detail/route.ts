import { NextRequest } from "next/server";

const NCM_URL = process.env.NCM_API_URL || "http://localhost:4000";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "缺少 ID" }, { status: 400 });

  try {
    const res = await fetch(`${NCM_URL}/song/detail?ids=${id}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return Response.json({ picUrl: null });
    const data = await res.json();
    const song = data?.songs?.[0];
    return Response.json({ picUrl: song?.al?.picUrl || null });
  } catch {
    return Response.json({ picUrl: null });
  }
}
