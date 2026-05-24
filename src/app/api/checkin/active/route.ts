import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireAuth();

    const active = await prisma.checkIn.findFirst({
      where: { userId: user.id, endedAt: null },
      include: { topic: true },
      orderBy: { startedAt: "desc" },
    });

    return Response.json({ active });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "获取失败" }, { status: 500 });
  }
}
