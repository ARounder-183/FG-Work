import { requireAuth } from "@/lib/auth";
import { syncActiveCheckInDuration } from "@/lib/study";

export async function POST() {
  try {
    const user = await requireAuth();
    const result = await syncActiveCheckInDuration(user.id);
    if (!result) return Response.json({ error: "没有进行中的打卡" }, { status: 400 });

    return Response.json({ duration: result.duration, activeId: result.id });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "上报失败" }, { status: 500 });
  }
}
