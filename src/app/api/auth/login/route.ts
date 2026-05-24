import { NextRequest } from "next/server";
import { compare } from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return Response.json({ error: "用户名和密码不能为空" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return Response.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    const valid = await compare(password, user.password);
    if (!valid) {
      return Response.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    const token = signToken({ userId: user.id, username: user.username });

    const cookieStore = await cookies();
    cookieStore.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return Response.json({
      user: { id: user.id, username: user.username, avatar: user.avatar, bio: user.bio },
    });
  } catch {
    return Response.json({ error: "登录失败，请稍后重试" }, { status: 500 });
  }
}
