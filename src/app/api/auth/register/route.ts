import { NextRequest } from "next/server";
import { hash } from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { buildAuthUser, signToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return Response.json({ error: "用户名和密码不能为空" }, { status: 400 });
    }

    if (username.length < 2 || username.length > 20) {
      return Response.json({ error: "用户名需要 2-20 个字符" }, { status: 400 });
    }

    if (password.length < 6) {
      return Response.json({ error: "密码至少 6 个字符" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return Response.json({ error: "用户名已被注册" }, { status: 409 });
    }

    const hashedPassword = await hash(password, 10);
    const user = await prisma.user.create({
      data: { username, password: hashedPassword },
    });

    const token = signToken({ userId: user.id, username: user.username });

    const cookieStore = await cookies();
    cookieStore.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return Response.json({ user: await buildAuthUser(user.id) });
  } catch (err) {
    console.error("Register error:", err);
    const message = err instanceof Error ? err.message : "注册失败，请稍后重试";
    return Response.json({ error: message }, { status: 500 });
  }
}
