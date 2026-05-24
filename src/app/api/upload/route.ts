import { NextRequest } from "next/server";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "posts");
const MAX_SIZE = 20 * 1024 * 1024;
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;

    if (!file) return Response.json({ error: "请选择图片" }, { status: 400 });
    if (!file.type.startsWith("image/")) return Response.json({ error: "只支持图片格式" }, { status: 400 });
    if (file.size > MAX_SIZE) return Response.json({ error: "图片不能超过 20MB" }, { status: 400 });

    await mkdir(UPLOAD_DIR, { recursive: true });

    const ext = file.name.split(".").pop() || "jpg";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    // Stream write - no memory buffering
    const stream = file.stream() as unknown as ReadableStream<Uint8Array>;
    const writeStream = createWriteStream(filepath);
    await pipeline(stream as never, writeStream);

    return Response.json({ url: `${BASE}/api/static/posts/${filename}` });
  } catch {
    return Response.json({ error: "上传失败" }, { status: 500 });
  }
}
