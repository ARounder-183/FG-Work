"use client";

import { apiUrl } from "@/lib/url";
import { useState, useEffect, useRef } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface Song { id: number; name: string; artists: string; album: string; duration: number; picUrl?: string; }
interface ActiveUser { id: string; username: string; avatar: string | null; }
interface Props {
  currentSong: Song | null; isPlaying: boolean; isCurrentUserSong: boolean; serverPosition: number;
  onSkipVote: () => void; onForceSkip: () => void; skipVotes: number; skipThreshold: number;
  activeUsers: ActiveUser[]; currentUserId: string | null;
  songSubmittedBy?: { username: string; avatar: string | null };
  onReportPosition?: (pos: number) => void;
}

function fmt(s: number) { const m = Math.floor(s/60); const sec = Math.floor(s%60); return `${m}:${String(sec).padStart(2,"0")}`; }
function fmtTotal(s: number) { if (s<=0) return "--:--"; return fmt(s); }

// Module-level singletons - survive component unmount/remount
let singletonAudio: HTMLAudioElement | null = null;
let singletonLastId: number | null = null;
let singletonReportTimer: ReturnType<typeof setInterval> | null = null;
let lastAutoSkip = 0;

// Module-level ref for current-user flag
let isCurrentUserRef = false;

function autoSkip() {
  if (!isCurrentUserRef) return; // Only the song owner can trigger auto-skip
  const now = Date.now();
  if (now - lastAutoSkip < 8000) return; // 8s cooldown
  lastAutoSkip = now;
  window.dispatchEvent(new CustomEvent("music-ended"));
}

function getAudio(): HTMLAudioElement {
  if (!singletonAudio) {
    singletonAudio = new Audio();
    singletonAudio.volume = 0.7;
  }
  return singletonAudio;
}

export function MainPlayer({ currentSong, isPlaying, isCurrentUserSong, serverPosition, onSkipVote, onForceSkip, skipVotes, skipThreshold, activeUsers, currentUserId, songSubmittedBy, onReportPosition }: Props) {
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [lyric, setLyric] = useState<string | null>(null);
  const [currentLine, setCurrentLine] = useState("");
  const reportRef = useRef(onReportPosition);
  reportRef.current = onReportPosition;
  isCurrentUserRef = isCurrentUserSong;
  const currentSongRef = useRef(currentSong);
  currentSongRef.current = currentSong;

  // Setup audio listeners
  useEffect(() => {
    const a = getAudio();
    const onTime = () => setPosition(a.currentTime);
    const onEnd = () => {
      const song = currentSongRef.current;
      const playedEnough = song && song.duration > 0 && a.currentTime >= song.duration * 0.9;
      if (!playedEnough) {
        // Premature end or unknown duration - retry playback
        setTimeout(() => a.play().catch(() => {}), 1000);
        return;
      }
      window.dispatchEvent(new CustomEvent("music-ended"));
    };
    const onError = () => {
      // Client-side error - retry playing, don't skip
      setTimeout(() => {
        if (a.src && a.paused) a.play().catch(() => {});
      }, 2000);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onError);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("error", onError);
      clearInterval(singletonReportTimer!);
    };
  }, []);

  // Volume
  useEffect(() => { getAudio().volume = volume; }, [volume]);

  // Load song - deduped by singletonLastId
  useEffect(() => {
    const a = getAudio();
    if (!currentSong) { a.pause(); a.src = ""; singletonLastId = null; return; }
    if (singletonLastId === currentSong.id) return;
    singletonLastId = currentSong.id;

    setCoverUrl(null);
    setLyric(null);
    fetch(apiUrl(`/api/music/song/detail?id=${currentSong.id}`)).then(r=>r.json()).then(d=>{if(d.picUrl)setCoverUrl(d.picUrl)}).catch(()=>{});

    // Fetch song URL with retries
    let retries = 0;
    const tryFetchUrl = () => {
      fetch(apiUrl(`/api/music/lyric?id=${currentSong.id}`)).then(r=>r.json()).then(d=>{if(d.lyric)setLyric(d.lyric)}).catch(()=>{});
      fetch(apiUrl(`/api/music/song?id=${currentSong.id}`)).then(r=>r.json()).then(d=>{
        if(d.url && singletonAudio){
          singletonAudio.src = d.url;
          singletonAudio.currentTime = 0;
          if (isPlaying) singletonAudio.play().catch(()=>{});
        } else {
          retries++;
          if (retries < 3) {
            setTimeout(tryFetchUrl, 2000);
          } else {
            autoSkip();
          }
        }
      });
    };
    tryFetchUrl();
  }, [currentSong?.id]);

  // Play/pause sync
  useEffect(() => {
    const a = getAudio(); if (!a.src) return;
    if (isPlaying && a.paused) a.play().catch(()=>{});
    else if (!isPlaying && !a.paused) a.pause();
  }, [isPlaying]);

  // Parse LRC and track current line
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

  // Progress sync
  useEffect(() => {
    const a = getAudio();
    if (isCurrentUserSong) {
      // Report position
      singletonReportTimer = setInterval(() => {
        if (a && !a.paused) reportRef.current?.(Math.floor(a.currentTime));
      }, 3000);
      return () => clearInterval(singletonReportTimer!);
    } else {
      // Follow server
      if (a.src && Math.abs(a.currentTime - serverPosition) > 2) {
        a.currentTime = serverPosition;
      }
    }
  }, [isCurrentUserSong, serverPosition]);

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
              {coverUrl ? <img src={coverUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-2xl">🎵</span>}
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
              <input type="range" min={0} max={1} step={0.05} value={volume} onChange={e=>setVolume(Number(e.target.value))} className="h-1 w-16 cursor-pointer accent-primary" />
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
