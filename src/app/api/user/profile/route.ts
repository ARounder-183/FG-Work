import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { username, bio } = await req.json();

    if (username !== undefined) {
      if (username.length < 2 || username.length > 20) {
        return Response.json({ error: "用户名需要 2-20 个字符" }, { status: 400 });
      }
      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing && existing.id !== user.id) {
        return Response.json({ error: "用户名已被占用" }, { status: 409 });
      }
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(username !== undefined && { username }),
        ...(bio !== undefined && { bio }),
      },
      select: { id: true, username: true, avatar: true, bio: true },
    });

    return Response.json({ user: updated });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "更新失败" }, { status: 500 });
  }
}
