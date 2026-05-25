import { NextRequest } from "next/server";
import { synthesizeSpeech } from "@/lib/tts";

export async function POST(req: NextRequest) {
  try {
    const { text, voice, speed, volume } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return Response.json({ error: "文本不能为空" }, { status: 400 });
    }

    const audio = await synthesizeSpeech({
      text: text.trim(),
      voice: voice || undefined,
      speed: speed || undefined,
      volume: volume || undefined,
    });

    if (!audio) {
      return Response.json({ error: "语音合成失败" }, { status: 500 });
    }

    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.length),
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return Response.json({ error: "请求失败" }, { status: 500 });
  }
}
