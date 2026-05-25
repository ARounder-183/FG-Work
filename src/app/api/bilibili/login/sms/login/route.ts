import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptCookie } from "@/lib/bili";
import { loginWithPhoneSms } from "@/lib/bili";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 BiliApp/6.66.0";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { tel, cid, code, captchaKey } = await req.json();

    if (!tel || !code || !captchaKey) {
      return Response.json({ error: "缺少参数" }, { status: 400 });
    }

    const cookies = await loginWithPhoneSms(tel, cid || "86", code, captchaKey);
    if (!cookies) {
      return Response.json({ error: "登录失败，验证码可能错误" }, { status: 400 });
    }

    const encrypted = encryptCookie(cookies);

    // Fetch user info
    let uname = "";
    let mid = "";
    try {
      const navRes = await fetch("https://api.bilibili.com/x/web-interface/nav", {
        headers: {
          Cookie: cookies,
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
    } catch { /* silent */ }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        bilibiliCookie: encrypted,
        bilibiliUid: mid || null,
        bilibiliUname: uname || null,
      },
    });

    return Response.json({ success: true, uname: uname || "B站用户" });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "登录失败" }, { status: 500 });
  }
}
