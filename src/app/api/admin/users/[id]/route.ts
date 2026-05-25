import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return Response.json({ error: "用户不存在" }, { status: 404 });
    if (user.role === "admin") {
      return Response.json({ error: "不能删除管理员" }, { status: 403 });
    }

    await prisma.user.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "删除失败" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const { role } = await req.json();
    if (!role) return Response.json({ error: "参数不完整" }, { status: 400 });
    if (!["user", "admin"].includes(role)) return Response.json({ error: "无效角色" }, { status: 400 });

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return Response.json({ error: "用户不存在" }, { status: 404 });

    // Prevent self-demotion
    if (id === admin.id && role !== "admin") {
      return Response.json({ error: "不能移除自己的管理员权限" }, { status: 403 });
    }

    await prisma.user.update({ where: { id }, data: { role } });
    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "更新失败" }, { status: 500 });
  }
}
