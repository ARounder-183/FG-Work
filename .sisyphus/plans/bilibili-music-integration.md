# Bilibili 音乐播放集成方案

## 1. 项目现状分析

### 1.1 技术栈
- **框架**: Next.js 16 + React 19 + TypeScript
- **数据库**: Prisma + SQLite (本地)
- **UI**: shadcn/ui + Tailwind CSS v4
- **播放器**: HTML5 `<audio>` 元素
- **音源**: 网易云音乐 API (`@neteasecloudmusicapienhanced/api`，独立进程运行在 4000 端口)

### 1.2 现有网易云音乐集成架构

```
┌──────────────────────────────────────────────────────┐
│  浏览器 (Browser)                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ RightPanels │  │  MainPlayer  │  │  MusicPage  │  │
│  │ (搜索/歌单)  │  │ (<audio>播放) │  │  (轮询状态)  │  │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘  │
└─────────┼────────────────┼────────────────┼──────────┘
          │ fetch()        │ fetch()        │ fetch()
          ▼                ▼                ▼
┌──────────────────────────────────────────────────────┐
│  Next.js API Routes (/api/music/*)                    │
│  ┌──────────┐ ┌────────┐ ┌────────┐ ┌────────────┐  │
│  │ /search  │ │ /song  │ │/playlist│ │  /state     │  │
│  └────┬─────┘ └───┬────┘ └───┬────┘ └─────┬──────┘  │
└───────┼────────────┼─────────┼─────────────┼─────────┘
        │            │         │             │
        ▼            ▼         ▼             ▼
┌──────────────────────────────────────────────────────┐
│  src/lib/ncm.ts (网易云封装)                           │
│  - searchSongs / searchPlaylists / getPlaylistDetail  │
│  - getSongUrl / getLyric / searchDjRadios             │
└───────────────────────┬──────────────────────────────┘
                        │ HTTP (localhost:4000)
                        ▼
┌──────────────────────────────────────────────────────┐
│  @neteasecloudmusicapienhanced/api (独立进程)          │
│  端口 4000                                            │
└──────────────────────────────────────────────────────┘
```

### 1.3 核心数据流

```
Song 接口: { id, name, artists, album, duration, picUrl }
         ↓ (JSON.stringify)
UserSong.songData / MusicState.currentSong
         ↓ (服务端切歌时)
validateSongUrl() → getSongUrl(id) → 检查 URL 是否有效
         ↓ (客户端播放时)
GET /api/music/song?id=xxx → 返回音频 URL → <audio>.src
```

### 1.4 关键集成点

| 集成点 | 文件 | 作用 |
|--------|------|------|
| 搜索 | `src/app/api/music/search/route.ts` | 调用 `ncm.searchSongs/searchPlaylists` |
| 获取音频URL | `src/app/api/music/song/route.ts` | 调用 `ncm.getSongUrl` |
| 验证URL有效性 | `src/lib/music-server.ts:validateSongUrl()` | 切歌前验证 |
| 歌词 | `src/app/api/music/lyric/route.ts` | 调用 `ncm.getLyric` |
| 歌单详情 | `src/app/api/music/playlist/route.ts` | 调用 `ncm.getPlaylistDetail` |
| 封面详情 | `src/app/api/music/song/detail/route.ts` | 调用 NCM 获取封面 |

---

## 2. Bilibili 音视频机制分析

### 2.1 Bilibili 视频结构

```
Bilibili 视频
├── BV号 (如 BV1xx411c7mD)  → 视频唯一标识
├── AV号 (如 av170001)      → 数字ID（与BV等价）
├── CID                     → 视频分P的标识
├── 视频流 (DASH格式)
│   ├── 视频轨 (.m4s)       → 不同分辨率
│   └── 音频轨 (.m4s)       → 独立音频流 ← 我们要提取这个
└── 元数据
    ├── 标题、封面
    ├── UP主信息
    └── 时长
```

### 2.2 关键 API 端点

| 功能 | API | 说明 |
|------|-----|------|
| 搜索 | `https://api.bilibili.com/x/web-interface/search/type?search_type=video` | 公开API |
| 视频信息 | `https://api.bilibili.com/x/web-interface/view?bvid=xxx` | 获取BV详情、CID |
| 播放地址 | `https://api.bilibili.com/x/player/playurl?bvid=xxx&cid=xxx&fnval=16&fnver=0` | fnval=16 获取DASH格式 |
| 收藏夹列表 | `https://api.bilibili.com/x/v3/fav/folder/created/list` | 需要Cookie |
| 收藏夹内容 | `https://api.bilibili.com/x/v3/fav/resource/list?media_id=xxx` | 需要Cookie |
| 用户歌单(合集) | `https://api.bilibili.com/x/polymer/web-space/seasons_series_list` | 需要Cookie |

### 2.3 音频提取流程

```
1. 获取视频页信息: /x/web-interface/view?bvid=BVxxx
   → 返回: { data: { cid, title, pic, duration, owner } }

2. 获取DASH播放地址: /x/player/wbi/playurl?bvid=BVxxx&cid=xxx&fnval=16&fnver=0
   → ⚠️ 此接口**也需要 WBI 签名**（旧版 /x/player/playurl 逐步废弃）
   → 返回: { data: { dash: { audio: [{ baseUrl, backupUrl }] } } }
   → ⚠️ 反爬加强，可能需要 buvid3 + bili_ticket + 正确的 UA/Referer

3. 使用 audio[0].baseUrl 作为音频源
   → 需要设置 Referer: https://www.bilibili.com
   → 需要 User-Agent (否则可能返回403/412)
   → ⏱ 音频URL有效期约 120 分钟（过期需重新获取）
```

### 2.4 BBPlayer 参考要点

BBPlayer 是一个 React Native 应用，但其 API 调用层是纯 JS：
- `src/lib/api/bilibili/api.ts` — Bilibili API 封装
- `src/lib/api/bilibili/client.ts` — HTTP 客户端（Cookie管理）
- `src/lib/api/bilibili/utils.ts` — 工具函数
- `src/lib/api/bilibili/wbi.ts` — WBI 签名（B站新版API需要）
- `src/lib/facades/bilibili.ts` — 外观层，统一搜索/获取接口

**本项目适配**: 由于是 Web 应用，无需考虑原生播放器。直接用 Next.js API Route 做服务端代理即可，避免浏览器跨域问题，且可以在服务端缓存音频URL。

---

## 3. API 端点验证清单

> 以下所有端点均已通过多个开源项目（yt-dlp, bilibili-api, RSSHub, bpi-rs, sigcli）、
> 官方 API 文档（SocialSisterYi/bilibili-API-collect）交叉验证。

### ✅ 已验证可用

| # | API 端点 | 方法 | 需要WBI | 需要登录 | 用途 |
|---|----------|------|---------|----------|------|
| 1 | `https://api.bilibili.com/x/web-interface/nav` | GET | ❌ | ❌ | 获取 WBI 密钥(`img_key`/`sub_key`)，**未登录也返回** |
| 2 | `https://api.bilibili.com/x/web-interface/wbi/search/type` | GET | ✅ | ❌ | 搜索视频。参数: `search_type=video`, `keyword`, `page` |
| 3 | `https://api.bilibili.com/x/web-interface/view` | GET | ❌ | ❌ | 视频详情。参数: `bvid`。返回 `cid`, `title`, `pic`, `duration` |
| 4 | `https://api.bilibili.com/x/player/wbi/playurl` | GET | ✅ | ❌ | 播放地址(DASH)。参数: `bvid`, `cid`, `fnval=16`, `fnver=0` |
| 5 | `https://passport.bilibili.com/x/passport-login/web/qrcode/generate` | GET | ❌ | ❌ | 生成登录二维码。返回 `qrcode_key`，有效期 180s |
| 6 | `https://passport.bilibili.com/x/passport-login/web/qrcode/poll` | GET | ❌ | ❌ | 轮询扫码状态。code: 86101=等待, 86090=已扫, 0=成功 |
| 7 | `https://api.bilibili.com/x/v3/fav/folder/created/list-all` | GET | ❌ | ✅ | 用户收藏夹列表。参数: `up_mid` |
| 8 | `https://api.bilibili.com/x/v3/fav/resource/list` | GET | ❌ | ✅ | 收藏夹内容。参数: `media_id`, `ps`, `pn`, `platform=web` |

### ⚠️ 注意事项

| 风险点 | 说明 |
|--------|------|
| **playurl 反爬升级** | 2024年新增WBI签名，2026年有报告 HTTP 412。需携带完整请求头：`User-Agent`, `Referer: https://www.bilibili.com`, `buvid3` Cookie |
| **buvid3 强制** | 2025年6月起搜索接口强制要求 `buvid3` Cookie，可首次访问 `bilibili.com` 获取 |
| **搜索频率限制** | ~100 次请求后触发 `v_voucher` 风控，需要间隔或切换 IP |
| **音频URL有效期** | DASH `baseUrl` 约 **120 分钟**后过期，播放时需实时获取 |
| **WBI密钥每日更新** | `img_key`/`sub_key` 每天更换，需缓存 + 定期刷新 |
| **bili_ticket** | 非必需但建议获取，可降低风控概率（有效期3天） |

### ❌ 不存在的端点（方案已排除）

- ~~`/x/v3/fav/folder/created/list`~~ → 实际为 `list-all`
- ~~`/x/player/playurl`（不带wbi）~~ → 已废弃，新版为 `/x/player/wbi/playurl`
- ~~`/x/web-interface/search/type`（不带wbi）~~ → 已废弃，新版为 `/x/web-interface/wbi/search/type`

---

## 4. 方案设计

### 3.1 总体架构

采用 **策略模式** 抽象音源，在现有架构中平行插入 Bilibili 支持：

```
                   ┌──────────────────┐
                   │   MusicSource    │ (接口)
                   │   Interface      │
                   └────────┬─────────┘
              ┌─────────────┴─────────────┐
              ▼                           ▼
    ┌──────────────────┐       ┌──────────────────┐
    │  NcmSource       │       │  BiliSource      │
    │  (现有 ncm.ts)   │       │  (新增 bili.ts)  │
    └──────────────────┘       └──────────────────┘
```

### 3.2 Song 接口扩展

```typescript
// 现有
interface Song {
  id: number;
  name: string;
  artists: string;
  album: string;
  duration: number;
  picUrl?: string;
}

// 扩展后
interface Song {
  id: number | string;        // NCM用number，B站用字符串(bvid)
  source: "ncm" | "bilibili"; // 音源标识 ← 关键新增字段
  name: string;
  artists: string;            // B站: UP主名称
  album: string;              // B站: 合集/收藏夹名(可为空)
  duration: number;
  picUrl?: string;
  // Bilibili 特有字段
  bvid?: string;              // BV号
  cid?: number;               // 分P的cid
}
```

### 3.3 新增文件清单

```
src/
├── lib/
│   ├── ncm.ts              ← 现有，不改
│   ├── bili.ts             ← 新增: Bilibili API封装(WBI签名/搜索/音频URL/收藏夹)
│   ├── bili-auth.ts        ← 新增: 扫码登录/Cookie加密管理
│   └── music-source.ts     ← 新增: 音源策略分发
├── app/api/
│   ├── music/
│   │   ├── search/route.ts     ← 修改: 支持 source 参数
│   │   ├── song/route.ts       ← 修改: 根据 source 调用不同API
│   │   ├── playlist/route.ts   ← 修改: 支持B站收藏夹(需登录cookie)
│   │   ├── lyric/route.ts      ← 修改: B站暂不支持歌词,返回空
│   │   └── song/detail/route.ts← 修改: 支持B站封面
│   └── bilibili/
│       └── login/
│           ├── qrcode/route.ts ← 新增: 生成登录二维码
│           ├── poll/route.ts   ← 新增: 轮询扫码状态
│           ├── status/route.ts ← 新增: 查询登录状态
│           └── logout/route.ts ← 新增: 登出
├── components/
│   ├── music/
│   │   ├── right-panels.tsx    ← 修改: 音源切换 + 登录入口
│   │   └── main-player.tsx     ← 修改: 显示音源/B站信息
│   └── bilibili-login.tsx      ← 新增: 二维码登录弹窗
└── prisma/
    └── schema.prisma           ← 修改: User表新增3个字段
```

### 3.4 详细设计

#### 3.4.1 `src/lib/bili.ts` — Bilibili API 封装

```typescript
// 核心功能:
export async function searchVideos(keywords: string, page: number): Promise<Song[]>
export async function getVideoInfo(bvid: string): Promise<VideoDetail>
export async function getAudioUrl(bvid: string, cid: number): Promise<string | null>
export async function getFavList(cookie: string): Promise<FavFolder[]>
export async function getFavDetail(mediaId: number, cookie: string): Promise<Song[]>

// 公共请求头
const HEADERS = {
  "User-Agent": "Mozilla/5.0 ...",
  "Referer": "https://www.bilibili.com",
};

// 音频URL获取 (核心)
// 1. 调用 /x/player/playurl?bvid=xxx&cid=xxx&fnval=16
// 2. 从 dash.audio 中提取 baseUrl
// 3. 注意: B站音频URL有效期较短(~2小时)，建议在播放前实时获取
```

#### 3.4.2 `src/lib/music-source.ts` — 音源策略分发

```typescript
// 根据 source 字段路由到对应的 API
export async function searchSongs(source: "ncm" | "bilibili", keywords: string, limit: number): Promise<Song[]>
export async function getSongUrl(song: Song): Promise<string | null>
export async function getSongDetail(song: Song): Promise<{ picUrl?: string }>
export async function getLyric(song: Song): Promise<string | null>
export async function getPlaylist(source: "ncm" | "bilibili", id: string, cookie?: string): Promise<{ name: string; tracks: Song[] }>
```

#### 3.4.3 API Route 修改

**`/api/music/search`**：
- 新增 `source` 参数 (`?source=ncm|bilibili`)
- 根据 source 调用不同的搜索函数
- B站搜索支持翻页 (通过 `page` 参数，每页20条)

**`/api/music/song`**：
- 改为接收完整 song 对象 (需要 `source`, `bvid`, `cid`)
- B站音频URL：调用 `getAudioUrl(bvid, cid)` 
- 因B站URL有效期短，**每次请求都实时获取**

**`/api/music/playlist`**：
- 新增 `source` 参数
- B站收藏夹：需要传入 `cookie` (从用户设置中读取)

**`/api/music/lyric`**：
- B站歌曲没有歌词API，直接返回 `{ lyric: null }`

#### 3.4.4 `music-server.ts` 修改

`validateSongUrl()` 函数需要改为支持双音源：

```typescript
async function validateSongUrl(songData: Song): Promise<boolean> {
  const source = songData.source || "ncm"; // 兼容旧数据
  if (source === "bilibili" && songData.bvid && songData.cid) {
    const url = await getBiliAudioUrl(songData.bvid, songData.cid);
    return url !== null;
  }
  // 原有NCM逻辑
  const url = await getSongUrl(String(songData.id));
  return url !== null;
}
```

#### 3.4.5 UI 修改 (`right-panels.tsx`)

在搜索面板顶部添加音源切换：

```
┌──────────────────────────┐
│ 添加歌曲                  │
├──────────────────────────┤
│ [网易云] [Bilibili]  ← 音源切换 │
├──────────────────────────┤
│ [搜索框]    [搜索]       │
├──────────────────────────┤
│ [单曲] [歌单] [播客]    │ ← B站模式: [视频] [收藏夹]
│                          │
│ 搜索结果列表...           │
└──────────────────────────┘
```

- 新增 `source` state (`"ncm" | "bilibili"`)
- 切换到B站时，Tab变为 `[视频] [收藏夹]`
- 搜索结果中的 `Song` 对象携带 `source: "bilibili"` 和 `bvid`

#### 3.4.6 数据库修改

`Song` 的 JSON 数据中新增字段即可，**无需修改 Prisma schema**（`songData` 是 JSON 字符串，灵活扩展）。

但建议在 `UserSong` / `MusicState` 层面不做变更。

### 3.5 B站 Cookie 管理 (可选功能)

如果需要访问B站用户的收藏夹：

1. 在用户设置页面添加 "B站Cookie" 配置项
2. Cookie 存储在 User 表的新字段或独立的 settings 表中
3. 服务器端读取 cookie 后调用 B站API

**方案**: 在 `User` 表新增 `bilibiliCookie` 字段 (`String?`)，或在 `src/lib/bili.ts` 中从环境变量读取。

### 3.6 Bilibili 登录（扫码）设计

#### 为什么需要登录
- 访问用户收藏夹、订阅合集 → 必须登录
- 搜索和播放的核心功能 → 不需要登录
- 登录是可选的，不登录也能搜歌听歌

#### 登录方式：二维码扫码

**流程**：
```
用户点击"登录B站" → 服务端生成二维码 → 展示给用户
→ 用户打开B站APP扫码确认 → 服务端轮询登录状态
→ 登录成功 → Cookie存数据库 → 可使用收藏夹等功能
```

**API 调用链**：
```typescript
// 1. 生成二维码
GET https://passport.bilibili.com/x/passport-login/web/qrcode/generate
→ { code: 0, data: { url: "https://...", qrcode_key: "xxx" } }
// 将 url 渲染为二维码图片

// 2. 轮询扫码状态
GET https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=xxx
→ 86101: 等待扫码
→ 86090: 已扫码，等待确认
→ 86038: 二维码已过期
→ 0: 登录成功，返回 Set-Cookie (SESSDATA, bili_jct, DedeUserID)

// 3. 存储 cookie
// 将返回的 cookies 加密存储到数据库
```

**数据库变更**（User 表新增字段）：
```prisma
model User {
  // ... 现有字段
  bilibiliCookie  String?  // 加密存储的B站cookie (SESSDATA=xxx; bili_jct=xxx; ...)
  bilibiliUid     String?  // B站用户UID
  bilibiliUname   String?  // B站用户名
}
```

**Cookie 安全存储**：
- 服务端收到登录 cookies 后，用 `AES-256-GCM` 加密
- 密钥从环境变量 `BILIBILI_COOKIE_ENCRYPT_KEY` 读取
- 加密后的 ciphertext 存入 `User.bilibiliCookie`
- API 调用时解密后使用

#### 新增文件和 API

```
src/
├── lib/
│   └── bili-auth.ts              ← 新增: 登录/登出/解密cookie
├── app/api/bilibili/
│   ├── login/qrcode/route.ts     ← 新增: 生成二维码
│   ├── login/poll/route.ts       ← 新增: 轮询扫码状态
│   ├── login/status/route.ts     ← 新增: 查询登录状态
│   └── login/logout/route.ts     ← 新增: 登出
├── components/
│   └── bilibili-login.tsx        ← 新增: 二维码弹窗组件
└── app/music/
    └── page.tsx                  ← 修改: 添加B站登录入口
```

#### UI 设计

```
搜索面板顶部 ─────────────────────
│ [🎵 网易云]  [📺 Bilibili]      │
├─────────────────────────────────┤
│ B站模式未登录时显示:             │
│ ┌─────────────────────────────┐ │
│ │ 🔐 登录B站，导入收藏夹       │ │
│ │    [扫码登录]               │ │
│ └─────────────────────────────┘ │
│                                 │
│ 已登录时显示:                    │
│ ┌─────────────────────────────┐ │
│ │ 👤 用户名 [已登录] [退出]    │ │
│ └─────────────────────────────┘ │
│ [视频] [收藏夹] [合集]          │
└─────────────────────────────────┘

点击"扫码登录" → 弹出模态框:
┌──────────────────────────┐
│     B站扫码登录            │
│                          │
│   ┌──────────────────┐   │
│   │                  │   │
│   │   [二维码图片]    │   │
│   │                  │   │
│   └──────────────────┘   │
│                          │
│  请使用B站APP扫描二维码    │
│  状态: 等待扫码...        │
│         [取消]           │
└──────────────────────────┘
```

### 3.7 兼容性处理

- **旧歌曲数据**: `songData` 中无 `source` 字段的，默认为 `"ncm"`
- **NCM 歌曲**: 完全不受影响，所有现有逻辑保持不变
- **B站歌曲**: 在 `songData` 中额外存储 `bvid` 和 `cid`，播放时使用

---

## 4. 实施计划

### Phase 1: 核心 API 层 (3个文件)

| # | 任务 | 文件 | 预估 |
|---|------|------|------|
| 1.1 | 创建 Bilibili API 封装 | `src/lib/bili.ts` | 核心 |
| 1.2 | 创建音源策略分发层 | `src/lib/music-source.ts` | 核心 |
| 1.3 | 修改歌曲URL获取API | `src/app/api/music/song/route.ts` | 小改 |

### Phase 2: 搜索与歌单 (4个文件)

| # | 任务 | 文件 | 预估 |
|---|------|------|------|
| 2.1 | 修改搜索 API (支持source) | `src/app/api/music/search/route.ts` | 中改 |
| 2.2 | 修改歌单 API (支持B站收藏夹) | `src/app/api/music/playlist/route.ts` | 中改 |
| 2.3 | 修改封面详情 API | `src/app/api/music/song/detail/route.ts` | 小改 |
| 2.4 | 修改歌词 API (B站返回空) | `src/app/api/music/lyric/route.ts` | 小改 |

### Phase 3: 服务端切歌逻辑 (1个文件)

| # | 任务 | 文件 | 预估 |
|---|------|------|------|
| 3.1 | validateSongUrl 支持B站 | `src/lib/music-server.ts` | 小改 |

### Phase 4: UI 层 (2个文件)

| # | 任务 | 文件 | 预估 |
|---|------|------|------|
| 4.1 | 搜索面板添加音源切换 | `src/components/music/right-panels.tsx` | 中改 |
| 4.2 | 主播放器显示音源信息 | `src/components/music/main-player.tsx` | 小改 |

### Phase 5: B站登录模块 (4个文件)

| # | 任务 | 文件 | 预估 |
|---|------|------|------|
| 5.1 | 创建登录/登出/Cookie管理 | `src/lib/bili-auth.ts` | 核心 |
| 5.2 | 二维码生成 + 轮询 + 状态 API | `src/app/api/bilibili/login/*` (4个路由) | 核心 |
| 5.3 | 二维码弹窗UI组件 | `src/components/bilibili-login.tsx` | 中 |
| 5.4 | User表 + 音乐页登录入口 | `prisma/schema.prisma` + `music/page.tsx` | 小改 |

### Phase 6: 登录后功能 (3个文件)

| # | 任务 | 文件 | 预估 |
|---|------|------|------|
| 6.1 | 收藏夹列表 + 详情获取 | `src/lib/bili.ts` 扩展 | 中 |
| 6.2 | 收藏夹/合集 API Route | `src/app/api/music/playlist/route.ts` | 中改 |
| 6.3 | 搜索面板"收藏夹"Tab | `src/components/music/right-panels.tsx` | 小改 |
| 6.4 | B站视频信息展示 (UP主/播放量) | `src/components/music/main-player.tsx` | 小改

---

## 5. 风险与注意事项

### 5.1 B站 API 限制
- **音频URL有效期**: ~2小时，需要播放时实时获取（已在设计中处理）
- **Referer 检查**: 必须带 `Referer: https://www.bilibili.com` 头
- **频率限制**: 搜索结果可能被限流，建议服务端加缓存
- **WBI 签名**: B站新版API部分接口需要 WBI 签名（`src/lib/bili.ts` 需实现）

### 5.2 音频格式兼容
- B站音频流通常是 AAC 编码的 `.m4s` 文件
- 主流浏览器均支持 AAC 解码
- 部分音频可能是 HE-AAC，兼容性需测试

### 5.3 向后兼容
- 所有修改通过 `source` 字段区分
- 默认值确保旧数据正常工作
- 不修改 Prisma schema

### 5.5 Cookie 安全
- B站 Cookie(`SESSDATA`) 等同账号密码，泄露可被盗号
- 服务端使用 AES-256-GCM 加密存储
- 加密密钥从环境变量读取，不写入代码
- 前端 API 不直接返回 cookie 明文

### 5.6 二维码有效期
- B站二维码有效期约 3 分钟
- 过期后需用户手动刷新重新生成
- 轮询间隔建议 2 秒
### 5.7 代码复用
- `Song` 接口的 `album` 字段在B站场景下可存储"合集名称"或留空
- `artists` 字段在B站场景下存储 UP主名称
- 播放器、队列管理、切歌逻辑等完全复用

---

## 6. 验收标准

- [ ] 搜索面板有 `[网易云] [Bilibili]` 音源切换
- [ ] B站模式下能搜索到视频（音频内容）
- [ ] WBI 签名正常工作，搜索不被拦截
- [ ] B站歌曲能添加到"我的歌单"
- [ ] B站歌曲能正常出声（DASH 音频流解码正常）
- [ ] 进度条、切歌、跳过等对B站歌曲正常
- [ ] **B站扫码登录**：生成二维码 → 扫码 → 登录成功
- [ ] 登录后能获取用户收藏夹列表
- [ ] 收藏夹歌曲能导入到我的歌单
- [ ] 登录态 Cookie 加密存储，API 不泄露明文
- [ ] 网易云歌曲功能不受任何影响（回归）
