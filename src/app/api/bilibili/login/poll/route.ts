import { NextRequest } from "next/server";
import { pollQRCode } from "@/lib/bili";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptCookie } from "@/lib/bili";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const qrcodeKey = searchParams.get("key");

    if (!qrcodeKey) {
      return Response.json({ error: "缺少 key" }, { status: 400 });
    }

    const result = await pollQRCode(qrcodeKey);

    if (result.status === "success") {
      // Encrypt and store cookies
      const encrypted = encryptCookie(result.cookies);

      // Fetch Bilibili user info with the new cookies
      let uname = "";
      let mid = "";
      try {
        const navRes = await fetch("https://api.bilibili.com/x/web-interface/nav", {
          headers: {
            Cookie: result.cookies,
            "User-Agent": UA,
            Referer: "https://www.bilibili.com/",
          },
        });
        const navJson = (await navRes.json()) as {
          code: number;
          data?: { uname?: string; mid?: number; isLogin?: boolean };
        };
        if (navJson.code === 0 && navJson.data?.isLogin) {
          uname = navJson.data.uname || "";
          mid = String(navJson.data.mid || "");
        }
      } catch { /* nav fetch failed, proceed without user info */ }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          bilibiliCookie: encrypted,
          bilibiliUid: mid || null,
          bilibiliUname: uname || null,
        },
      });

      return Response.json({ ...result, uname: uname || "B站用户" });
    }

    return Response.json(result);
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "轮询失败" }, { status: 500 });
  }
}
