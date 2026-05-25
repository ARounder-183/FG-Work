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
let singletonLastId: number | string | null = null;

function getAudio(): HTMLAudioElement {
  if (!singletonAudio) {
    singletonAudio = new Audio();
    singletonAudio.volume = 0.7;
  }
  return singletonAudio;
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
  const endedRetries = useRef(0);
  const errorRetries = useRef(0);

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
      if (errorRetries.current < 3) {
        errorRetries.current++;
        setTimeout(() => {
          if (a.src && a.paused) a.play().catch(() => {});
        }, 2000);
      }
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

  // ── Volume ─────────────────────────────────────────────────────────
  useEffect(() => { getAudio().volume = volume; }, [volume]);

  // ── Load song ──────────────────────────────────────────────────────
  useEffect(() => {
    const a = getAudio();
    if (!currentSong) { a.pause(); a.src = ""; singletonLastId = null; return; }
    const songKey = currentSong.source === "bilibili" ? (currentSong.bvid ?? currentSong.id) : currentSong.id;
    if (songKey == null || singletonLastId === songKey) return;
    singletonLastId = songKey ?? null;

    setCoverUrl(null);
    endedRetries.current = 0;
    errorRetries.current = 0;
    seekFailCount.current = 0;

    // Build query params
    const params = new URLSearchParams();
    const isBili = currentSong.source === "bilibili";
    if (isBili) {
      params.set("source", "bilibili");
      params.set("bvid", currentSong.bvid || "");
      params.set("cid", String(currentSong.cid ?? ""));
    } else {
      params.set("id", String(currentSong.id));
    }

    // Fetch cover — for Bilibili, use song data directly (already has picUrl from search)
    if (isBili) {
      // Bilibili cover from song data — proxy handles protocol + Referer
      if (currentSong.picUrl) setCoverUrl(currentSong.picUrl);
    } else {
      // NCM: need separate API to get cover
      const detailParams = new URLSearchParams();
      detailParams.set("id", String(currentSong.id));
      fetch(apiUrl(`/api/music/song/detail?${detailParams.toString()}`))
        .then(r => r.json())
        .then(d => { if (d.picUrl) setCoverUrl(d.picUrl); })
        .catch(() => {});
    }

    // Fetch song URL (one-shot, no retry — server validates URL at advance time)
    fetch(apiUrl(`/api/music/song?${params.toString()}`))
      .then(r => r.json())
      .then(d => {
        if (d.url && singletonAudio) {
          if (isBili) {
            // Bilibili CDN requires Referer — proxy through our server
            const encoded = btoa(d.url);
            singletonAudio.src = apiUrl(`/api/music/stream?url=${encodeURIComponent(encoded)}`);
          } else {
            singletonAudio.src = (d.url as string).replace(/^http:/, "https:");
          }
          singletonAudio.currentTime = 0;
          if (isPlaying) singletonAudio.play().catch(() => {});
        }
        // If no URL: server timer will advance. Client silently waits for next poll.
      })
      .catch(() => {});
  }, [currentSong?.id, currentSong?.bvid]);

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
      .then(r => r.json())
      .then(d => { if (d.lyric) setLyric(d.lyric); })
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

  // ── Progress sync (all clients follow server) ──────────────────────
  const seekFailCount = useRef(0);
  useEffect(() => {
    const a = getAudio();
    if (!a.src) return;
    const drift = Math.abs(a.currentTime - serverPosition);
    if (drift > 2 && seekFailCount.current < 5) {
      a.currentTime = serverPosition;
      // Verify seek worked — streaming sources may silently reject seek
      if (Math.abs(a.currentTime - serverPosition) > 1) {
        seekFailCount.current++;
      }
    }
  }, [serverPosition]);

  const dur = currentSong?.duration || 0;
  const pct = dur > 0 ? Math.min((position / dur) * 100, 100) : 0;

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
              <span>{fmt(position)}</span><span>{fmtTotal(dur)}</span>
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
