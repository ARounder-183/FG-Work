// ─── 讯飞在线语音合成（WebSocket TTS） ───────────────────────────────
// Node 22+ 内置 WebSocket，无需额外依赖

import { createHmac } from "crypto";

const TTS_HOST = "tts-api.xfyun.cn";
const TTS_PATH = "/v2/tts";
const TTS_URL = `wss://${TTS_HOST}${TTS_PATH}`;

const APP_ID = process.env.XF_TTS_APP_ID || "";
const API_KEY = process.env.XF_TTS_API_KEY || "";
const API_SECRET = process.env.XF_TTS_API_SECRET || "";

// ── 签名生成 ─────────────────────────────────────────────────────────

function generateAuthUrl(): string {
  const date = new Date().toUTCString(); // RFC 1123
  const signString = `host: ${TTS_HOST}\ndate: ${date}\nGET ${TTS_PATH} HTTP/1.1`;
  const signature = createHmac("sha256", API_SECRET).update(signString).digest("base64");

  const authOrigin = `api_key="${API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authOrigin).toString("base64");

  const params = new URLSearchParams({ host: TTS_HOST, date, authorization });
  return `${TTS_URL}?${params}`;
}

// ── 语音合成 ─────────────────────────────────────────────────────────

export interface TtsOptions {
  text: string;
  voice?: string;  // 发音人，默认 x4_xiaoyan
  speed?: number;  // 语速 0-100，默认 50
  volume?: number; // 音量 0-100，默认 50
}

/** 返回合成后的音频 Buffer（MP3 格式），失败返回 null */
export async function synthesizeSpeech(opts: TtsOptions): Promise<Buffer | null> {
  const { text, voice = "x4_xiaoyan", speed = 50, volume = 50 } = opts;

  if (!APP_ID || !API_KEY || !API_SECRET) {
    console.error("[TTS] Missing credentials. Set XF_TTS_APP_ID, XF_TTS_API_KEY, XF_TTS_API_SECRET");
    return null;
  }

  const url = generateAuthUrl();
  const ws = new WebSocket(url);

  const chunks: Buffer[] = [];

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("TTS WebSocket timeout"));
      }, 15000);

      ws.onopen = () => {
        const request = {
          common: { app_id: APP_ID },
          business: {
            aue: "lame",
            sfl: 1,
            auf: "audio/L16;rate=16000",
            vcn: voice,
            speed,
            volume,
            pitch: 50,
            tte: "UTF8",
          },
          data: {
            status: 2,
            text: Buffer.from(text, "utf8").toString("base64"),
          },
        };
        ws.send(JSON.stringify(request));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data.toString());
          if (msg.code !== 0) {
            console.error("[TTS] Error:", msg.code, msg.message);
            reject(new Error(msg.message || "TTS error"));
            return;
          }
          if (msg.data?.audio) {
            chunks.push(Buffer.from(msg.data.audio, "base64"));
          }
          if (msg.data?.status === 2) {
            // 合成完成
            clearTimeout(timeout);
            ws.close(1000);
            resolve();
          }
        } catch {
          // 解析失败跳过
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timeout);
        reject(err);
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        resolve(); // 可能在 status=2 之前就关闭了
      };
    });

    if (chunks.length === 0) return null;
    return Buffer.concat(chunks);
  } catch (err) {
    console.error("[TTS]", err);
    return null;
  } finally {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  }
}
