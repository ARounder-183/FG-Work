"use client";

import { apiUrl, proxyImage } from "@/lib/url";
import { useState, useEffect, useRef } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface Song { id: number | string; name: string; artists: string; album: string; duration: number; picUrl?: string; source?: "ncm" | "bilibili"; bvid?: string; cid?: number; }
interface ActiveUser { id: string; username: string; avatar: string | null; }
interface Props {
  currentSong: Song | null; isPlaying: boolean; isCurrentUserSong: boolean; serverPosition: number;
  onSkipVote: () => void; onForceSkip: () => void; skipVotes: number; skipThreshold: number;
  activeUsers: ActiveUser[]; currentUserId: string | null;
  songSubmittedBy?: { username: string; avatar: string | null };
}

function fmt(s: number) { const m = Math.floor(s/60); const sec = Math.floor(s%60); return `${m}:${String(sec).padStart(2,"0")}`; }
function fmtTotal(s: number) { if (s<=0) return "--:--"; return fmt(s); }

// Module-level singletons — survive component unmount/remount
let singletonAudio: HTMLAudioElement | null = null;
let singletonLastKey: string | null = null;
let swRegistered = false;

function getAudio(): HTMLAudioElement {
  if (!singletonAudio) {
    singletonAudio = new Audio();
    singletonAudio.volume = 0.7;
  }
  return singletonAudio;
}

/** Register Service Worker to fix B站 CDN Referer headers */
async function ensureSW(): Promise<boolean> {
  if (swRegistered) return true;
  if (!("serviceWorker" in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.register("/sw-bili.js", { scope: "/" });
    // Wait for activation
    if (reg.installing) {
      await new Promise<void>((resolve) => {
        reg.installing!.addEventListener("statechange", () => {
          if (reg.installing!.state === "activated") resolve();
        });
      });
    }
    swRegistered = true;
    return true;
  } catch {
    return false;
  }
}

export function MainPlayer({ currentSong, isPlaying, isCurrentUserSong, serverPosition, onSkipVote, onForceSkip, skipVotes, skipThreshold, activeUsers, currentUserId, songSubmittedBy }: Props) {
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("music-volume");
      if (saved) return Number(saved);
    }
    return 0.7;
  });
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [lyric, setLyric] = useState<string | null>(null);
  const [currentLine, setCurrentLine] = useState("");
  const currentSongRef = useRef(currentSong);
  currentSongRef.current = currentSong;
  const serverPositionRef = useRef(serverPosition);
  serverPositionRef.current = serverPosition;
  const endedRetries = useRef(0);
  const errorRetries = useRef(0);
  const seekFailCount = useRef(0);
  // Track current raw CDN URL for proxy fallback
  const biliRawUrl = useRef<string | null>(null);

  // ── Register Service Worker for B站 Referer injection ──────────────
  useEffect(() => { ensureSW(); }, []);

  // ── Audio event listeners ──────────────────────────────────────────
  useEffect(() => {
    const a = getAudio();
    const onTime = () => setPosition(a.currentTime);
    const onEnd = () => {
      const song = currentSongRef.current;
      const playedEnough = song && song.duration > 0 && a.currentTime >= song.duration * 0.9;
      if (!playedEnough && endedRetries.current < 3) {
        endedRetries.current++;
        setTimeout(() => a.play().catch(() => {}), 1000);
      }
      // 重试 3 次仍未播完或正常结束 → 等服务端时钟切歌
    };
    const onError = () => {
      // Retry transient errors (up to 3 times on same src)
      if (errorRetries.current < 3) {
        errorRetries.current++;
        setTimeout(() => {
          if (a.src && a.paused) a.play().catch(() => {});
        }, 2000);
        return;
      }

      const song = currentSongRef.current;
      if (song?.source === "bilibili") {
        // Direct access failed (SW not active / CDN rejected) — fall back to proxy
        if (biliRawUrl.current && !a.src.startsWith(apiUrl(""))) {
          // Currently on direct URL → switch to proxy
          console.warn("[播放器] SW 直连失败 → 降级到代理");
          errorRetries.current = 0;
          const encoded = btoa(biliRawUrl.current);
          a.src = apiUrl(`/api/music/stream?url=${encodeURIComponent(encoded)}`);
          a.currentTime = serverPositionRef.current || 0;
          a.play().catch(() => {});
        } else {
          // Already on proxy — re-fetch fresh URL from server
          console.warn("[播放器] 代理也失败 → 重新获取 B站 URL");
          errorRetries.current = 0;
          refetchBiliUrl(song);
        }
      }
      // For NCM: just stop after retries — server timer will advance
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onError);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("error", onError);
    };
  }, []);

  // ── Re-fetch B站 URL from server on error (CDN URL may have expired) ───
  function refetchBiliUrl(song: Song) {
    const params = new URLSearchParams();
    params.set("source", "bilibili");
    params.set("bvid", song.bvid || "");
    params.set("cid", String(song.cid ?? ""));
    fetch(apiUrl(`/api/music/song?${params.toString()}`))
      .then((r) => r.json())
      .then((d) => {
        if (d.url && singletonAudio) {
          loadBiliAudio(singletonAudio, d.url as string);
        }
      })
      .catch(() => {});
  }

  // ── Volume ─────────────────────────────────────────────────────────
  useEffect(() => { getAudio().volume = volume; }, [volume]);

  // ── Load song ──────────────────────────────────────────────────────
  useEffect(() => {
    const a = getAudio();
    if (!currentSong) { a.pause(); a.src = ""; singletonLastKey = null; return; }
    const songKey = currentSong.source === "bilibili"
      ? `bili:${currentSong.bvid ?? currentSong.id}`
      : `ncm:${currentSong.id}`;
    if (songKey == null || singletonLastKey === songKey) return;
    singletonLastKey = songKey ?? null;

    setCoverUrl(null);
    endedRetries.current = 0;
    errorRetries.current = 0;
    seekFailCount.current = 0;
    biliRawUrl.current = null;

    const isBili = currentSong.source === "bilibili";

    // ── Cover ──────────────────────────────────────────────────────────
    if (isBili) {
      if (currentSong.picUrl) setCoverUrl(currentSong.picUrl);
    } else {
      const detailParams = new URLSearchParams();
      detailParams.set("id", String(currentSong.id));
      fetch(apiUrl(`/api/music/song/detail?${detailParams.toString()}`))
        .then((r) => r.json())
        .then((d) => { if (d.picUrl) setCoverUrl(d.picUrl); })
        .catch(() => {});
    }

    // ── Audio URL ──────────────────────────────────────────────────────
    if (isBili) {
      // Each client calls B站 API independently — B站 CDN URLs are per-session
      const params = new URLSearchParams();
      params.set("source", "bilibili");
      params.set("bvid", currentSong.bvid || "");
      params.set("cid", String(currentSong.cid ?? ""));
      fetch(apiUrl(`/api/music/song?${params.toString()}`))
        .then((r) => r.json())
        .then((d) => { if (d.url && singletonAudio) loadBiliAudio(singletonAudio, d.url as string); })
        .catch(() => {});
    } else {
      // NCM: direct URL — no proxy needed
      const params = new URLSearchParams();
      params.set("id", String(currentSong.id));
      fetch(apiUrl(`/api/music/song?${params.toString()}`))
        .then((r) => r.json())
        .then((d) => {
          if (d.url && singletonAudio) {
            singletonAudio.src = (d.url as string).replace(/^http:/, "https:");
            singletonAudio.currentTime = serverPositionRef.current || 0;
            if (isPlaying) singletonAudio.play().catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [currentSong?.id, currentSong?.bvid]);

  /** Load B站 audio: direct CDN via Service Worker (adds Referer), proxy fallback */
  function loadBiliAudio(a: HTMLAudioElement, rawUrl: string) {
    biliRawUrl.current = rawUrl;
    errorRetries.current = 0;

    // Service Worker intercepts *.bilivideo.com requests and injects Referer header
    const finalUrl = rawUrl.replace(/^http:\/\//, "https://");
    console.log("[播放器] SW 直连模式:", finalUrl.slice(0, 80));
    a.src = finalUrl;
    a.currentTime = serverPositionRef.current || 0;
    if (isPlaying) a.play().catch(() => {});
  }

  // ── Fetch lyric ────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentSong) { setLyric(null); return; }
    setLyric(null);
    const isBili = currentSong.source === "bilibili";
    const lyricParams = new URLSearchParams();
    if (isBili) {
      lyricParams.set("source", "bilibili");
    } else {
      lyricParams.set("id", String(currentSong.id));
    }
    fetch(apiUrl(`/api/music/lyric?${lyricParams.toString()}`))
      .then((r) => r.json())
      .then((d) => { if (d.lyric) setLyric(d.lyric); })
      .catch(() => {});
  }, [currentSong?.id, currentSong?.bvid]);

  // ── Play/pause sync ────────────────────────────────────────────────
  useEffect(() => {
    const a = getAudio(); if (!a.src) return;
    if (isPlaying && a.paused) a.play().catch(() => {});
    else if (!isPlaying && !a.paused) a.pause();
  }, [isPlaying]);

  // ── Parse LRC and track current line ───────────────────────────────
  useEffect(() => {
    if (!lyric) { setCurrentLine(""); return; }
    const lines = lyric.split("\n").map((l) => {
      const m = l.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
      if (!m) return null;
      return { time: parseInt(m[1]) * 60 + parseFloat(m[2]), text: m[3].trim() };
    }).filter(Boolean) as { time: number; text: string }[];

    if (lines.length === 0) { setCurrentLine(""); return; }

    const a = getAudio();
    const update = () => {
      const t = a.currentTime;
      const line = lines.reduce((prev, curr) => (curr.time <= t ? curr : prev), lines[0]);
      setCurrentLine(line.text || "");
    };
    update();
    a.addEventListener("timeupdate", update);
    return () => a.removeEventListener("timeupdate", update);
  }, [lyric]);

  // ── Progress sync (server is single source of truth) ───────────────
  // Seek to server position when drift exceeds 1.5s.
  // Verification is deferred because seeking completes asynchronously.
  useEffect(() => {
    const a = getAudio();
    if (!a.src) return;
    const drift = Math.abs(a.currentTime - serverPosition);
    if (drift > 1.5 && seekFailCount.current < 10) {
      a.currentTime = serverPosition;
      // Deferred check — browser may need a frame to actually apply the seek
      const serverAtCall = serverPosition;
      setTimeout(() => {
        if (Math.abs(a.currentTime - serverAtCall) > 3) {
          seekFailCount.current++;
        }
      }, 600);
    }
  }, [serverPosition]);

  const dur = currentSong?.duration || 0;
  // Progress bar: server position is authoritative.
  // CSS transition (duration-1000) smoothly bridges 2s polling gaps.
  const barPos = serverPosition || position;
  const pct = dur > 0 ? Math.min((barPos / dur) * 100, 100) : 0;

  return (
    <div className="flex w-full max-w-lg flex-col items-center space-y-4">
      <div className="flex flex-wrap justify-center gap-1.5">
        {activeUsers.map(u => {
          const isCur = u.id === currentUserId;
          return (
            <div key={u.id} className="relative flex flex-col items-center">
              <div className={`rounded-full ${isCur?"ring-2 ring-primary animate-pulse":""}`}>
                <Avatar className={`h-9 w-9 ${isCur?"":"opacity-60"}`}>
                  <AvatarImage src={u.avatar||""} />
                  <AvatarFallback className="text-[11px]">{u.username.slice(0,2).toUpperCase()}</AvatarFallback>
                </Avatar>
              </div>
              {isCur && <div className="absolute -bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary" />}
              <span className="mt-0.5 text-[10px] text-muted-foreground">{u.username}</span>
            </div>
          );
        })}
        {activeUsers.length===0 && <p className="py-4 text-xs text-muted-foreground">还没有人加入音乐室</p>}
      </div>

      {currentSong ? (
        <div className="w-full space-y-3">
          <div className="flex gap-3 rounded-xl bg-card p-4 shadow-sm">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
              {coverUrl ? <img src={proxyImage(coverUrl)} alt="" className="h-full w-full object-cover" /> : <span className="text-2xl">🎵</span>}
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <h2 className="truncate text-base font-bold">{currentSong.name}</h2>
              <p className="truncate text-sm text-muted-foreground">{currentSong.artists}</p>
              <p className="truncate text-xs text-muted-foreground/70">{currentSong.album}</p>
            </div>
          </div>

          <div className="space-y-1">
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all duration-1000" style={{width:`${pct}%`}} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{fmt(barPos)}</span><span>{fmtTotal(dur)}</span>
            </div>
          </div>

          {/* Lyrics */}
          {currentLine && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-center text-sm text-muted-foreground italic">
              {currentLine}
            </div>
          )}

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={onSkipVote} className="text-xs">⏭ 切歌 ({skipVotes}/{skipThreshold})</Button>
            {isCurrentUserSong && (
              <Button variant="ghost" size="sm" onClick={onForceSkip} className="text-xs text-destructive">跳过</Button>
            )}
            <div className="flex items-center gap-1">
              <span className="text-xs">🔊</span>
              <input type="range" min={0} max={1} step={0.05} value={volume} onChange={e => { const v = Number(e.target.value); setVolume(v); localStorage.setItem("music-volume", String(v)); }} className="h-1 w-16 cursor-pointer accent-primary" />
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-sm rounded-xl border-2 border-dashed border-muted p-10 text-center">
          <div className="mb-3 flex justify-center"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/50"><span className="text-3xl">🎧</span></div></div>
          <h3 className="text-sm font-medium text-muted-foreground">等待音乐</h3>
          <p className="mt-1 text-xs text-muted-foreground/60">从右侧添加歌曲到你的歌单，加入音乐室即可自动播放</p>
        </div>
      )}
    </div>
  );
}
