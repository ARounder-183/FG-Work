import { requireAuth } from "@/lib/auth";
import { getPhoneCaptcha } from "@/lib/bili";

export async function GET() {
  try {
    await requireAuth();
    const data = await getPhoneCaptcha();
    if (!data) {
      return Response.json({ error: "获取验证码失败" }, { status: 500 });
    }
    return Response.json(data);
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "获取验证码失败" }, { status: 500 });
  }
}
