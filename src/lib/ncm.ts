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
  al?: { name: string; picUrl?: string };
  dt?: number;
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
    if (NCM_COOKIE) url.searchParams.set("cookie", NCM_COOKIE);
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    if (res.ok) return (await res.json()) as T;
    return null;
  } catch {
    return null;
  }
}

function mapSongs(raw: NcmSongRaw[]): Song[] {
  return raw.map((s) => {
    const dtMs = s.dt || 0;
    return {
      id: s.id,
      name: s.name,
      artists: (s.ar || []).map((a) => a.name).join(" / "),
      album: s.al?.name || "",
      duration: dtMs > 0 ? Math.floor(dtMs / 1000) : 0,
      picUrl: s.al?.picUrl,
    };
  });
}

export async function searchSongs(keywords: string, limit = 20): Promise<Song[]> {
  const data = await ncm<NcmSearchResult>("/search", { keywords, limit, type: 1 });
  if (data?.result?.songs) return mapSongs(data.result.songs);
  return [];
}

export async function searchPlaylists(keywords: string, limit = 10) {
  const data = await ncm<NcmPlaylistSearchResult>("/search", { keywords, limit, type: 1000 });
  return data?.result?.playlists || [];
}

export async function getPlaylistDetail(id: string | number) {
  const data = await ncm<NcmPlaylistDetailResult>("/playlist/detail", { id: String(id) });
  if (data?.playlist) {
    return { name: data.playlist.name, tracks: mapSongs(data.playlist.tracks) };
  }
  return null;
}

export async function getSongUrl(id: string | number): Promise<string | null> {
  // Try multiple quality levels
  for (const level of ["lossless", "exhigh", "higher", "standard"]) {
    const data = await ncm<NcmSongUrlResult>("/song/url/v1", { id: String(id), level });
    if (data?.data?.[0]?.url) return data.data[0].url;
  }
  return null;
}
