import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sendPhoneSms } from "@/lib/bili";

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const { tel, cid, token, challenge, validate, seccode } = await req.json();

    if (!tel || !token) {
      return Response.json({ error: "缺少参数" }, { status: 400 });
    }

    const captchaKey = await sendPhoneSms(
      tel,
      cid || "86",
      token,
      challenge || "",
      validate || "",
      seccode || "",
    );
    if (!captchaKey) {
      return Response.json({ error: "发送短信失败" }, { status: 400 });
    }
    return Response.json({ captchaKey });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "发送短信失败" }, { status: 500 });
  }
}
