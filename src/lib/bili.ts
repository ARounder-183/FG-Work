// Bilibili API integration
// Uses public APIs — no login required for search and playback.
// Login (QR code) needed only for favorites/collections.

import crypto from "crypto";

// ════════════════════════════════════════════════════════════════════
//  Constants
// ════════════════════════════════════════════════════════════════════

const BILI_HOST = "https://api.bilibili.com";
const PASSPORT_HOST = "https://passport.bilibili.com";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// B站 passport API 对移动端 UA 更友好（BBPlayer 验证过）
const PASSPORT_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 BiliApp/6.66.0";

// WBI mixin key shuffle table (fixed, from bilibili-API-collect)
const MIXIN_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33,
  9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17,
  0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 52, 44, 34,
];

// ════════════════════════════════════════════════════════════════════
//  Song type (exported for reuse across the codebase)
// ════════════════════════════════════════════════════════════════════

export interface BiliSong {
  id: string; // bvid
  name: string;
  artists: string; // UP主
  album: string; // 合集/收藏夹名
  duration: number;
  picUrl?: string;
  source: "bilibili";
  bvid: string;
  cid: number;
  /** 原始视频aid */
  aid?: number;
  /** 播放量 */
  playCount?: number;
}

// ════════════════════════════════════════════════════════════════════
//  WBI Signing
// ════════════════════════════════════════════════════════════════════

interface WbiCache {
  imgKey: string;
  subKey: string;
  fetchedAt: number; // ms
}

let wbiCache: WbiCache | null = null;
const WBI_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4h, keys rotate daily

function getMixinKey(raw: string): string {
  return MIXIN_ENC_TAB.reduce((s, i) => s + raw[i], "").slice(0, 32);
}

async function fetchWbiKeys(): Promise<{ imgKey: string; subKey: string }> {
  if (wbiCache && Date.now() - wbiCache.fetchedAt < WBI_CACHE_TTL_MS) {
    return { imgKey: wbiCache.imgKey, subKey: wbiCache.subKey };
  }

  const res = await fetch(`${BILI_HOST}/x/web-interface/nav`, {
    headers: { "User-Agent": UA, Referer: "https://www.bilibili.com/" },
  });
  const json = await res.json();

  // Nav returns wbi_img even when not logged in (code: -101)
  const wbiImg = json?.data?.wbi_img;
  if (!wbiImg?.img_url || !wbiImg?.sub_url) {
    throw new Error("Failed to extract WBI keys from nav");
  }

  const imgKey = wbiImg.img_url.split("/").pop()!.split(".")[0];
  const subKey = wbiImg.sub_url.split("/").pop()!.split(".")[0];

  wbiCache = { imgKey, subKey, fetchedAt: Date.now() };
  return { imgKey, subKey };
}

export async function signWbi(
  params: Record<string, string | number>,
): Promise<Record<string, string>> {
  const { imgKey, subKey } = await fetchWbiKeys();
  const mixinKey = getMixinKey(imgKey + subKey);

  const wts = Math.floor(Date.now() / 1000).toString();
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    raw[k] = String(v);
  }
  raw.wts = wts;

  // Sort by key, URL-encode, concatenate
  const sorted = Object.keys(raw)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(raw[k])}`)
    .join("&");

  const wRid = crypto.createHash("md5").update(sorted + mixinKey).digest("hex");
  return { ...raw, w_rid: wRid };
}

// ════════════════════════════════════════════════════════════════════
//  buvid3 — device fingerprint cookie (required for search since 2025.06)
// ════════════════════════════════════════════════════════════════════

let buvid3: string | null = null;

/** Generate a random buvid3 if we don't have one yet */
function generateBuvid3(): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function getBuvid3(): string {
  if (!buvid3) buvid3 = generateBuvid3();
  return buvid3;
}

// ════════════════════════════════════════════════════════════════════
//  HTTP helpers
// ════════════════════════════════════════════════════════════════════

async function biliGet(
  path: string,
  params: Record<string, string>,
  opts: {
    cookie?: string;
    signed?: boolean;
    referer?: string;
  } = {},
): Promise<unknown> {
  const { cookie, signed = false, referer = "https://www.bilibili.com/" } = opts;

  let query = params;
  if (signed) {
    query = await signWbi(query);
  }

  const url = new URL(path, BILI_HOST);
  Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const headers: Record<string, string> = {
    "User-Agent": UA,
    Referer: referer,
  };
  if (cookie) {
    headers.Cookie = cookie;
  } else {
    // Always include buvid3 for search
    headers.Cookie = `buvid3=${getBuvid3()}`;
  }

  const res = await fetch(url.toString(), {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Bilibili HTTP ${res.status}: ${res.statusText} for ${path}`);
  }
  return res.json();
}

// ════════════════════════════════════════════════════════════════════
//  Passthrough headers for audio URL (used by browser, not server)
// ════════════════════════════════════════════════════════════════════

export function getAudioHeaders(): Record<string, string> {
  return {
    Referer: "https://www.bilibili.com/",
    "User-Agent": UA,
  };
}

// ════════════════════════════════════════════════════════════════════
//  Public API: Search
// ════════════════════════════════════════════════════════════════════

export async function searchVideos(
  keyword: string,
  page = 1,
): Promise<BiliSong[]> {
  const data = await biliGet(
    "/x/web-interface/wbi/search/type",
    {
      search_type: "video",
      keyword,
      page: String(page),
    },
    { signed: true },
  );

  const result = (data as { data?: { result?: BiliSearchItem[] } })?.data?.result;
  if (!result || !Array.isArray(result)) return [];

  return result.map((item) => ({
    id: item.bvid,
    name: stripTags(item.title),
    artists: item.author || item.owner?.name || "未知UP主",
    album: "",
    duration: parseDuration(item.duration),
    picUrl: item.pic ? item.pic.replace(/^https?:\/\//, "https://").replace(/^\/\//, "https://") : undefined,
    source: "bilibili" as const,
    bvid: item.bvid,
    cid: 0, // search results don't include cid — fetched later
    aid: item.aid,
    playCount: item.play ?? item.stat?.view,
  }));
}

// Raw search result shape
interface BiliSearchItem {
  bvid: string;
  aid: number;
  title: string;
  author?: string;
  owner?: { name: string };
  duration: string;
  pic?: string;
  play?: number;
  stat?: { view: number };
  tag?: string;
  pubdate?: number;
}

// ════════════════════════════════════════════════════════════════════
//  Public API: Video Info (gets cid, title, cover, etc.)
// ════════════════════════════════════════════════════════════════════

interface VideoInfo {
  bvid: string;
  aid: number;
  cid: number;
  title: string;
  pic: string;
  duration: number;
  owner: { name: string; mid: number };
  desc?: string;
}

export async function getVideoInfo(
  bvid: string,
): Promise<VideoInfo | null> {
  const data = await biliGet("/x/web-interface/view", { bvid });
  const v = (data as { data?: VideoInfo })?.data;
  if (!v) return null;
  return {
    bvid: v.bvid ?? bvid,
    aid: v.aid,
    cid: v.cid,
    title: v.title,
    pic: v.pic,
    duration: v.duration,
    owner: v.owner,
    desc: v.desc,
  };
}

// ════════════════════════════════════════════════════════════════════
//  Public API: Audio URL (DASH stream)
// ════════════════════════════════════════════════════════════════════

export async function getAudioUrl(
  bvid: string,
  cid: number,
  cookie?: string,
): Promise<string | null> {
  try {
    // Auto-resolve CID if not available (search results don't include CID)
    let realCid = cid;
    if (!cid || cid <= 0) {
      const info = await getVideoInfo(bvid);
      if (!info?.cid) return null;
      realCid = info.cid;
    }

    const data = await biliGet(
      "/x/player/wbi/playurl",
      {
        bvid,
        cid: String(realCid),
        fnval: "16", // DASH format
        fnver: "0",
        fourk: "1",
      },
      {
        signed: true,
        cookie: cookie || undefined,
        referer: `https://www.bilibili.com/video/${bvid}/`,
      },
    );

    const dash = (data as { data?: { dash?: { audio?: AudioStream[] } } })?.data?.dash;
    if (!dash?.audio?.length) return null;

    // Pick highest quality audio (by bandwidth)
    const best = dash.audio.reduce((a, b) =>
      (a.bandwidth ?? 0) > (b.bandwidth ?? 0) ? a : b,
    );
    return best.baseUrl ?? best.base_url ?? null;
  } catch {
    return null;
  }
}

interface AudioStream {
  id: number;
  baseUrl?: string;
  base_url?: string;
  bandwidth?: number;
  mimeType?: string;
}

// ════════════════════════════════════════════════════════════════════
//  Public API: Favorites (requires login cookie)
// ════════════════════════════════════════════════════════════════════

export interface BiliFavFolder {
  id: number; // mlid (full id)
  fid: number; // original fid
  title: string;
  mediaCount: number;
}

export async function getFavFolders(
  upMid: string,
  cookie: string,
): Promise<BiliFavFolder[]> {
  const data = await biliGet(
    "/x/v3/fav/folder/created/list-all",
    { up_mid: upMid, web_location: "333.1387" },
    { cookie, referer: "https://space.bilibili.com/" },
  );

  const list = (data as { data?: { list?: BiliFavFolderRaw[] } })?.data?.list;
  if (!list) return [];

  return list.map((f) => ({
    id: f.id,
    fid: f.fid,
    title: f.title,
    mediaCount: f.media_count,
  }));
}

interface BiliFavFolderRaw {
  id: number;
  fid: number;
  title: string;
  media_count: number;
}

export async function getFavDetail(
  mediaId: number,
  cookie: string,
  page = 1,
): Promise<{ songs: BiliSong[]; hasMore: boolean }> {
  const data = await biliGet(
    "/x/v3/fav/resource/list",
    {
      media_id: String(mediaId),
      ps: "20",
      pn: String(page),
      platform: "web",
    },
    { cookie, referer: "https://space.bilibili.com/" },
  );

  const result = data as { data?: { medias?: FavMediaItem[]; has_more?: boolean } };
  const medias = result?.data?.medias;
  const hasMore = result?.data?.has_more ?? false;

  if (!medias) return { songs: [], hasMore: false };

  const songs = medias.map((item) => {
    // Extract cid from page info if available
    let cid = 0;
    if (item.pages?.[0]?.cid) {
      cid = item.pages[0].cid;
    }

    const duration = item.duration ?? 0;

    return {
      id: item.bvid,
      name: item.title,
      artists: item.upper?.name ?? "未知UP主",
      album: "",
      duration: typeof duration === "number" ? duration : parseDuration(String(duration)),
      picUrl: item.cover ? item.cover.replace(/^https?:\/\//, "https://").replace(/^\/\//, "https://") : undefined,
      source: "bilibili" as const,
      bvid: item.bvid,
      cid,
      aid: item.id,
    };
  });

  return { songs, hasMore };
}

interface FavMediaItem {
  id: number;
  bvid: string;
  title: string;
  cover?: string;
  duration?: number | string;
  upper?: { name: string; mid: number };
  pages?: Array<{ cid: number }>;
}

// ════════════════════════════════════════════════════════════════════
//  Login: QR Code (used by bili-auth.ts)
// ════════════════════════════════════════════════════════════════════

export async function generateQRCode(): Promise<{
  url: string;
  qrcodeKey: string;
}> {
  const res = await fetch(
    `${PASSPORT_HOST}/x/passport-login/web/qrcode/generate`,
    {
      headers: {
        "User-Agent": PASSPORT_UA,
        Referer: "https://www.bilibili.com/",
      },
    },
  );
  const json = (await res.json()) as {
    code: number;
    data?: { url: string; qrcode_key: string };
  };
  if (json.code !== 0 || !json.data) {
    throw new Error(`QR generate failed: ${JSON.stringify(json)}`);
  }
  return { url: json.data.url, qrcodeKey: json.data.qrcode_key };
}

export type QRCodeStatus =
  | { status: "pending"; code: 86101 }
  | { status: "scanned"; code: 86090 }
  | { status: "expired"; code: 86038 }
  | { status: "success"; code: 0; cookies: string };

export async function pollQRCode(qrcodeKey: string): Promise<QRCodeStatus> {
  const url = new URL(
    "/x/passport-login/web/qrcode/poll",
    PASSPORT_HOST,
  );
  url.searchParams.set("qrcode_key", qrcodeKey);

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": PASSPORT_UA,
      Referer: "https://www.bilibili.com/",
    },
  });
  const json = (await res.json()) as {
    code: number;
    message?: string;
    data?: { code: number; message?: string };
  };

  const dataCode = json.data?.code ?? json.code;

  // Extract Set-Cookie headers
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookies = setCookie.join("; ");

  switch (dataCode) {
    case 0:
      return { status: "success", code: 0, cookies };
    case 86090:
      return { status: "scanned", code: 86090 };
    case 86038:
      return { status: "expired", code: 86038 };
    default:
      return { status: "pending", code: 86101 };
  }
}

// ════════════════════════════════════════════════════════════════════
//  Login: Phone SMS (ref: BBPlayer)
// ════════════════════════════════════════════════════════════════════

export interface PhoneCaptchaData {
  token: string;
  geetest: { gt: string; challenge: string };
}

/** 获取手机号登录的图形验证 token */
export async function getPhoneCaptcha(): Promise<PhoneCaptchaData | null> {
  try {
    const res = await fetch(
      `${PASSPORT_HOST}/x/passport-login/captcha?source=main_web&t=${Date.now()}`,
      {
        headers: {
          "User-Agent": PASSPORT_UA,
          Referer: "https://www.bilibili.com/",
        },
      },
    );
    const json = (await res.json()) as {
      code: number;
      data?: { token: string; geetest: { gt: string; challenge: string } };
    };
    if (json.code !== 0 || !json.data) return null;
    return { token: json.data.token, geetest: json.data.geetest };
  } catch {
    return null;
  }
}

/** 发送手机短信验证码 */
export async function sendPhoneSms(
  tel: string,
  cid: string,
  token: string,
  challenge: string,
  validate: string,
  seccode: string,
): Promise<string | null> {
  try {
    const body = new URLSearchParams({
      cid,
      tel,
      source: "main_mini_login",
      token,
      challenge,
      validate,
      seccode,
    });
    const res = await fetch(
      `${PASSPORT_HOST}/x/passport-login/web/sms/send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": PASSPORT_UA,
          Referer: "https://www.bilibili.com/",
          Origin: "https://www.bilibili.com",
        },
        body: body.toString(),
      },
    );
    const json = (await res.json()) as {
      code: number;
      message?: string;
      data?: { captcha_key: string };
    };
    if (json.code !== 0 || !json.data?.captcha_key) {
      console.warn("[BILI SMS] send failed:", json);
      return null;
    }
    return json.data.captcha_key;
  } catch {
    return null;
  }
}

/** 使用短信验证码登录，返回 cookie 字符串 */
export async function loginWithPhoneSms(
  tel: string,
  cid: string,
  code: string,
  captchaKey: string,
): Promise<string | null> {
  try {
    const body = new URLSearchParams({
      cid,
      tel,
      code,
      source: "main_mini_login",
      captcha_key: captchaKey,
      keep: "1",
    });
    const res = await fetch(
      `${PASSPORT_HOST}/x/passport-login/web/login/sms`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": PASSPORT_UA,
          Referer: "https://www.bilibili.com/",
          Origin: "https://www.bilibili.com",
        },
        body: body.toString(),
      },
    );
    const json = (await res.json()) as {
      code: number;
      message?: string;
      data?: { status: number };
    };
    if (json.code !== 0) {
      console.warn("[BILI SMS] login failed:", json);
      return null;
    }
    const cookies = res.headers.getSetCookie?.() ?? [];
    return cookies.join("; ");
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════
//  Utils
// ════════════════════════════════════════════════════════════════════

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function parseDuration(d: string): number {
  // Bilibili durations come as "MM:SS" or "HH:MM:SS"
  const parts = d.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

/** Decrypt stored cookie for API calls */
export function decryptCookie(encrypted: string): string {
  const key = process.env.BILIBILI_COOKIE_ENCRYPT_KEY;
  if (!key) {
    console.warn("[BILI] No BILIBILI_COOKIE_ENCRYPT_KEY set, returning raw cookie");
    return encrypted;
  }
  try {
    const [ivHex, authTagHex, cipherHex] = encrypted.split(":");
    if (!ivHex || !authTagHex || !cipherHex) return encrypted;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      Buffer.from(key.padEnd(32, "0").slice(0, 32)),
      Buffer.from(ivHex, "hex"),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    let decrypted = decipher.update(cipherHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    // If decryption fails, assume raw cookie (backward compat)
    return encrypted;
  }
}

/** Encrypt cookie for storage */
export function encryptCookie(plaintext: string): string {
  const key = process.env.BILIBILI_COOKIE_ENCRYPT_KEY;
  if (!key) {
    console.warn("[BILI] No BILIBILI_COOKIE_ENCRYPT_KEY set, storing raw cookie");
    return plaintext;
  }
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    Buffer.from(key.padEnd(32, "0").slice(0, 32)),
    iv,
  );
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}
