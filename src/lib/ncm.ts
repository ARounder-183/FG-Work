// NetEase Cloud Music API integration
// Requires a running NCM API server. Use: npm run dev (starts both Next.js + NCM)

const NCM_URL = process.env.NCM_API_URL || "http://localhost:4000";
const NCM_COOKIE = process.env.NCM_COOKIE || "";

export interface Song {
  id: number;
  name: string;
  artists: string;
  album: string;
  duration: number;
  picUrl?: string;
}

interface NcmSongRaw {
  id: number;
  name: string;
  ar?: { name: string }[];
  artists?: { name: string }[] | string;
  al?: { name: string; picUrl?: string };
  dt?: number;
  duration?: number;
}

interface NcmSearchResult {
  result?: {
    songCount?: number;
    songs?: NcmSongRaw[];
  };
}

interface NcmPlaylistResult {
  playlist?: {
    name: string;
    tracks: NcmSongRaw[];
    trackCount?: number;
    coverImgUrl?: string;
  };
}

interface NcmPlaylistSearchResult {
  result?: {
    playlistCount?: number;
    playlists?: Array<{
      id: number;
      name: string;
      coverImgUrl?: string;
      trackCount?: number;
    }>;
  };
}

interface NcmSongUrlResult {
  data?: Array<{ id?: number; url?: string; br?: number }>;
}

interface NcmPlaylistDetailResult {
  playlist?: {
    name: string;
    tracks: NcmSongRaw[];
  };
}

async function ncm<T>(path: string, params: Record<string, string | number> = {}): Promise<T | null> {
  try {
    const url = new URL(path, NCM_URL);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    if (NCM_COOKIE) {
      url.search += (url.search ? "&" : "?") + "cookie=" + NCM_COOKIE;
    }
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    if (res.ok) return (await res.json()) as T;
    return null;
  } catch {
    return null;
  }
}

function mapSongs(raw: NcmSongRaw[]): Song[] {
  return raw.map((s) => {
    const dtMs = s.dt || s.duration || 0;
    let artistStr = "";
    if (s.ar?.length) {
      artistStr = s.ar.map((a) => a.name).join(" / ");
    } else if (Array.isArray(s.artists)) {
      artistStr = s.artists.map((a: { name: string }) => a.name).join(" / ");
    } else if (typeof s.artists === "string") {
      artistStr = s.artists;
    }
    return {
      id: s.id,
      name: s.name,
      artists: artistStr,
      album: s.al?.name || "",
      duration: dtMs > 0 ? Math.floor(dtMs / 1000) : 0,
      picUrl: s.al?.picUrl,
    };
  });
}

export async function searchSongs(keywords: string, limit = 50): Promise<Song[]> {
  const data = await ncm<{ result?: { songs?: NcmSongRaw[] }; body?: { result?: { songs?: NcmSongRaw[] } } }>("/search", { keywords, limit, type: 1 });
  const raw = data?.result?.songs || data?.body?.result?.songs || [];
  return mapSongs(raw);
}

export async function searchPlaylists(keywords: string, limit = 30) {
  const data = await ncm<{ result?: { playlists?: Array<{ id: number; name: string; coverImgUrl?: string; trackCount?: number; creator?: { nickname: string } }> }; body?: { result?: { playlists?: Array<{ id: number; name: string; coverImgUrl?: string; trackCount?: number; creator?: { nickname: string } }> } } }>("/search", { keywords, limit, type: 1000 });
  return data?.result?.playlists || data?.body?.result?.playlists || [];
}

export async function getPlaylistDetail(id: string | number) {
  const data = await ncm<{ playlist?: { name: string; tracks: NcmSongRaw[] }; body?: { playlist?: { name: string; tracks: NcmSongRaw[] } } }>("/playlist/detail", { id: String(id) });
  const pl = data?.playlist || data?.body?.playlist;
  if (pl) return { name: pl.name, tracks: mapSongs(pl.tracks) };
  return null;
}

export async function searchDjRadios(keywords: string, limit = 30) {
  const data = await ncm<{ result?: { voicelist?: Array<{ id: number; name: string; coverUrl?: string; programCount?: number; dj?: { nickname: string } }> }; body?: { result?: { voicelist?: Array<{ id: number; name: string; coverUrl?: string; programCount?: number; dj?: { nickname: string } }> } } }>("/voicelist/search", { keyword: keywords, limit });
  return data?.result?.voicelist || data?.body?.result?.voicelist || [];
}

export async function getDjPrograms(rid: string | number, limit = 50) {
  const data = await ncm<{ programs?: Array<{ mainSong: NcmSongRaw }>; body?: { programs?: Array<{ mainSong: NcmSongRaw }> } }>("/dj/program", { rid: String(rid), limit });
  const programs = data?.programs || data?.body?.programs || [];
  return mapSongs(programs.map((p) => p.mainSong));
}

export async function getSongUrl(id: string | number): Promise<string | null> {
  for (const level of ["lossless", "exhigh", "higher", "standard"]) {
    const data = await ncm<{ data?: Array<{ url?: string }>; body?: { data?: Array<{ url?: string }> } }>("/song/url/v1", { id: String(id), level });
    const url = data?.data?.[0]?.url || data?.body?.data?.[0]?.url;
    if (url) return url;
  }
  return null;
}

export async function getLyric(id: string | number): Promise<string | null> {
  const data = await ncm<{ lrc?: { lyric?: string } }>("/lyric", { id: String(id) });
  return data?.lrc?.lyric || null;
}

export async function getSongDetail(
  id: string | number,
): Promise<{ picUrl?: string; duration?: number } | null> {
  const data = await ncm<{ songs?: NcmSongRaw[] }>("/song/detail", { ids: String(id) });
  const s = data?.songs?.[0];
  if (!s) return null;
  const dtMs = s.dt || s.duration || 0;
  return {
    picUrl: s.al?.picUrl,
    duration: dtMs > 0 ? Math.floor(dtMs / 1000) : undefined,
  };
}
