import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();

    // Ensure singleton MusicState exists
    let state = await prisma.musicState.findUnique({ where: { id: "singleton" } });
    if (!state) {
      state = await prisma.musicState.create({ data: { id: "singleton" } });
    }

    // Add user to queue order if not already there
    const queueOrder: string[] = JSON.parse(state.queueOrder);
    if (!queueOrder.includes(user.id)) {
      queueOrder.push(user.id);
      await prisma.musicState.update({
        where: { id: "singleton" },
        data: { queueOrder: JSON.stringify(queueOrder) },
      });
    }

    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "加入失败" }, { status: 500 });
  }
}
