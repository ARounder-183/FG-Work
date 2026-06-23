import { requireAuth } from "@/lib/auth";
import { closeActiveCheckIn } from "@/lib/study";

export async function POST() {
  try {
    const user = await requireAuth();
    const result = await closeActiveCheckIn(user.id);
    if (!result) {
      return Response.json({ error: "没有进行中的打卡" }, { status: 400 });
    }

    return Response.json(result);
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "结束失败" }, { status: 500 });
  }
}
