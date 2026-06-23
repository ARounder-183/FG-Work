import { NextRequest } from "next/server";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import { prisma } from "@/lib/prisma";
import { buildAuthUser, requireAuth } from "@/lib/auth";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "avatars");
const MAX_SIZE = 5 * 1024 * 1024;
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const formData = await req.formData();
    const file = formData.get("avatar") as File | null;

    if (!file) return Response.json({ error: "请选择图片" }, { status: 400 });
    if (!file.type.startsWith("image/")) return Response.json({ error: "只支持图片格式" }, { status: 400 });
    if (file.size > MAX_SIZE) return Response.json({ error: "图片不能超过 5MB" }, { status: 400 });

    await mkdir(UPLOAD_DIR, { recursive: true });

    const ext = file.name.split(".").pop() || "jpg";
    const filename = `${user.id}-${Date.now()}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    const stream = file.stream() as unknown as ReadableStream<Uint8Array>;
    const writeStream = createWriteStream(filepath);
    await pipeline(stream as never, writeStream);

    const avatarUrl = `${BASE}/api/static/avatars/${filename}`;
    await prisma.user.update({
      where: { id: user.id },
      data: { avatar: avatarUrl },
    });

    return Response.json({ user: await buildAuthUser(user.id) });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "上传失败" }, { status: 500 });
  }
}
