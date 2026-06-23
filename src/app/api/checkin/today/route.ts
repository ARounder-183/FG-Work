import { requireAuth } from "@/lib/auth";
import { getTodayStudySummary } from "@/lib/study";

export async function GET() {
  try {
    const user = await requireAuth();
    return Response.json(await getTodayStudySummary(user.id));
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "获取失败" }, { status: 500 });
  }
}
