import { NextRequest } from "next/server";
import { generateQRCode } from "@/lib/bili";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(); // Must be logged into the app first
    const result = await generateQRCode();
    return Response.json({ url: result.url, qrcodeKey: result.qrcodeKey });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "生成二维码失败" }, { status: 500 });
  }
}
