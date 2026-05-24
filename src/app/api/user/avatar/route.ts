import { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "avatars");
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();

    const formData = await req.formData();
    const file = formData.get("avatar") as File | null;

    if (!file) {
      return Response.json({ error: "请选择图片" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return Response.json({ error: "只支持图片格式" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return Response.json({ error: "图片不能超过 2MB" }, { status: 400 });
    }

    await mkdir(UPLOAD_DIR, { recursive: true });

    const ext = file.name.split(".").pop() || "jpg";
    const filename = `${user.id}-${Date.now()}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    const avatarUrl = `/uploads/avatars/${filename}`;

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { avatar: avatarUrl },
      select: { id: true, username: true, avatar: true, bio: true },
    });

    return Response.json({ user: updated });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "上传失败" }, { status: 500 });
  }
}
