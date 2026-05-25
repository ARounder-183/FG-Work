// Music source abstraction — routes between NCM and Bilibili APIs
// based on the "source" field in Song data.

import type { Song } from "@/lib/ncm";
import type { BiliSong } from "@/lib/bili";

// Re-export the unified Song type
export type { Song } from "@/lib/ncm";

/** Extended Song with union of NCM + Bili fields */
export interface AnySong {
  id: number | string;
  name: string;
  artists: string;
  album: string;
  duration: number;
  picUrl?: string;
  source?: "ncm" | "bilibili";
  // Bilibili extra
  bvid?: string;
  cid?: number;
}

export function getSource(song: AnySong): "ncm" | "bilibili" {
  return song.source || "ncm";
}

// ════════════════════════════════════════════════════════════════════
//  Song URL
// ════════════════════════════════════════════════════════════════════

export async function getSongUrl(
  song: AnySong,
  cookie?: string,
): Promise<string | null> {
  const src = getSource(song);

  if (src === "bilibili") {
    if (!song.bvid || !song.cid) return null;
    const { getAudioUrl: biliAudio } = await import("@/lib/bili");
    return biliAudio(song.bvid, song.cid, cookie);
  }

  // NCM path
  const { getSongUrl: ncmSongUrl } = await import("@/lib/ncm");
  return ncmSongUrl(String(song.id));
}

// ════════════════════════════════════════════════════════════════════
//  Validate URL (used by music-server for pre-check)
// ════════════════════════════════════════════════════════════════════

export async function validateSongUrl(
  song: AnySong,
  cookie?: string,
): Promise<boolean> {
  try {
    const url = await getSongUrl(song, cookie);
    return url !== null && url.length > 0;
  } catch {
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════
//  Song Detail (cover, etc.)
// ════════════════════════════════════════════════════════════════════

export async function getSongDetail(
  song: AnySong,
): Promise<{ picUrl?: string; playCount?: number } | null> {
  const src = getSource(song);

  if (src === "bilibili") {
    if (!song.bvid) return null;
    const { getVideoInfo } = await import("@/lib/bili");
    const info = await getVideoInfo(song.bvid);
    if (!info) return null;
    return {
      picUrl: info.pic ? info.pic.replace(/^\/\//, "https://") : undefined,
      playCount: undefined,
    };
  }

  // NCM: picUrl is already in song data from search, just return it
  return { picUrl: song.picUrl };
}

// ════════════════════════════════════════════════════════════════════
//  Lyric
// ════════════════════════════════════════════════════════════════════

export async function getLyric(song: AnySong): Promise<string | null> {
  const src = getSource(song);

  if (src === "bilibili") {
    // Bilibili has no public lyric API — return null
    return null;
  }

  const { getLyric: ncmLyric } = await import("@/lib/ncm");
  return ncmLyric(String(song.id));
}
