"use client";

import { apiUrl, proxyImage } from "@/lib/url";
import { useState, useEffect, useRef } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface Song {
  id: number | string;
  name: string;
  artists: string;
  album: string;
  duration: number;
  picUrl?: string;
  source?: "ncm" | "bilibili";
  bvid?: string;
  cid?: number;
}

interface ActiveUser {
  id: string;
  username: string;
  avatar: string | null;
}

interface Props {
  currentSong: Song | null;
  isPlaying: boolean;
  isCurrentUserSong: boolean;
  serverPosition: number;
  onSkipVote: () => void;
  onForceSkip: () => void;
  skipVotes: number;
  skipThreshold: number;
  activeUsers: ActiveUser[];
  currentUserId: string | null;
  songSubmittedBy?: { username: string; avatar: string | null };
}

function fmt(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remain = Math.floor(seconds % 60);
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

function fmtTotal(seconds: number) {
  if (seconds <= 0) return "--:--";
  return fmt(seconds);
}

let singletonAudio: HTMLAudioElement | null = null;
let singletonLastKey: string | null = null;
let singletonPlaybackToken = 0;

function getAudio() {
  if (!singletonAudio) {
    singletonAudio = new Audio();
    singletonAudio.volume = 0.7;
  }

  return singletonAudio;
}

export function MainPlayer({
  currentSong,
  isPlaying,
  isCurrentUserSong,
  serverPosition,
  onSkipVote,
  onForceSkip,
  skipVotes,
  skipThreshold,
  activeUsers,
  currentUserId,
  songSubmittedBy,
}: Props) {
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
  const serverPositionRef = useRef(serverPosition);
  const endedRetries = useRef(0);
  const errorRetries = useRef(0);
  const seekFailCount = useRef(0);

  useEffect(() => {
    currentSongRef.current = currentSong;
  }, [currentSong]);

  useEffect(() => {
    serverPositionRef.current = serverPosition;
  }, [serverPosition]);

  useEffect(() => {
    const audio = getAudio();

    const onTime = () => setPosition(audio.currentTime);
    const onEnd = () => {
      const song = currentSongRef.current;
      const playedEnough = song && song.duration > 0 && audio.currentTime >= song.duration * 0.9;
      if (!playedEnough && endedRetries.current < 3) {
        endedRetries.current += 1;
        window.setTimeout(() => audio.play().catch(() => {}), 1000);
      }
    };

    const onError = () => {
      if (errorRetries.current < 3) {
        errorRetries.current += 1;
        window.setTimeout(() => {
          if (audio.src && audio.paused) {
            audio.play().catch(() => {});
          }
        }, 2000);
        return;
      }

      const song = currentSongRef.current;
      if (song?.source === "bilibili") {
        errorRetries.current = 0;
        void refetchBiliUrl(song, isPlaying, serverPositionRef.current, singletonPlaybackToken);
      }
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("error", onError);
    };
  }, [isPlaying]);

  useEffect(() => {
    getAudio().volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = getAudio();

    if (!currentSong) {
      audio.pause();
      audio.src = "";
      singletonLastKey = null;
      setCoverUrl(null);
      setLyric(null);
      setCurrentLine("");
      return;
    }

    const songKey = currentSong.source === "bilibili"
      ? `bili:${currentSong.bvid ?? currentSong.id}`
      : `ncm:${currentSong.id}`;

    if (singletonLastKey === songKey) return;

    singletonPlaybackToken += 1;
    const playbackToken = singletonPlaybackToken;
    singletonLastKey = songKey;
    endedRetries.current = 0;
    errorRetries.current = 0;
    seekFailCount.current = 0;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    setPosition(0);
    setCoverUrl(currentSong.source === "bilibili" ? currentSong.picUrl || null : null);
    setLyric(null);
    setCurrentLine("");

    if (currentSong.source === "bilibili") {
      void refetchBiliUrl(currentSong, isPlaying, serverPositionRef.current, playbackToken);
      return;
    }

    const detailParams = new URLSearchParams();
    detailParams.set("id", String(currentSong.id));
    fetch(apiUrl(`/api/music/song/detail?${detailParams.toString()}`))
      .then((response) => response.json())
      .then((data) => {
        if (data.picUrl) setCoverUrl(data.picUrl);
      })
      .catch(() => {});

    const params = new URLSearchParams();
    params.set("id", String(currentSong.id));
    fetch(apiUrl(`/api/music/song?${params.toString()}`))
      .then((response) => response.json())
      .then((data) => {
        if (!data.url || !singletonAudio || playbackToken !== singletonPlaybackToken) return;

        singletonAudio.src = String(data.url).replace(/^http:/, "https:");
        singletonAudio.currentTime = serverPositionRef.current || 0;
        if (isPlaying) singletonAudio.play().catch(() => {});
      })
      .catch(() => {});
  }, [currentSong, isPlaying]);

  useEffect(() => {
    if (!currentSong) return;

    const lyricParams = new URLSearchParams();
    if (currentSong.source === "bilibili") {
      lyricParams.set("source", "bilibili");
    } else {
      lyricParams.set("id", String(currentSong.id));
    }

    fetch(apiUrl(`/api/music/lyric?${lyricParams.toString()}`))
      .then((response) => response.json())
      .then((data) => setLyric(data.lyric || null))
      .catch(() => {});
  }, [currentSong]);

  useEffect(() => {
    const audio = getAudio();
    if (!audio.src) return;

    if (isPlaying && audio.paused) {
      audio.play().catch(() => {});
    } else if (!isPlaying && !audio.paused) {
      audio.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!lyric) {
      setCurrentLine("");
      return;
    }

    const lines = lyric
      .split("\n")
      .map((line) => {
        const match = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
        if (!match) return null;
        return {
          time: parseInt(match[1], 10) * 60 + parseFloat(match[2]),
          text: match[3].trim(),
        };
      })
      .filter(Boolean) as Array<{ time: number; text: string }>;

    if (lines.length === 0) {
      setCurrentLine("");
      return;
    }

    const audio = getAudio();
    const update = () => {
      const current = audio.currentTime;
      const line = lines.reduce((prev, entry) => (entry.time <= current ? entry : prev), lines[0]);
      setCurrentLine(line.text || "");
    };

    update();
    audio.addEventListener("timeupdate", update);
    return () => audio.removeEventListener("timeupdate", update);
  }, [lyric]);

  useEffect(() => {
    const audio = getAudio();
    if (!audio.src) return;

    const drift = Math.abs(audio.currentTime - serverPosition);
    if (drift > 1.5 && seekFailCount.current < 10) {
      audio.currentTime = serverPosition;
      window.setTimeout(() => {
        if (Math.abs(audio.currentTime - serverPosition) > 3) {
          seekFailCount.current += 1;
        }
      }, 600);
    }
  }, [serverPosition]);

  const duration = currentSong?.duration || 0;
  const progressPosition = serverPosition || position;
  const progress = duration > 0 ? Math.min((progressPosition / duration) * 100, 100) : 0;
  const sourceLabel = currentSong?.source === "bilibili" ? "Bilibili 音频" : "网易云音乐";

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
        <Card className="overflow-hidden rounded-[28px] border border-border/60 bg-[linear-gradient(135deg,rgba(19,32,28,0.95),rgba(31,45,41,0.88))] text-white shadow-[0_25px_80px_-40px_rgba(0,0,0,0.65)] dark:bg-[linear-gradient(135deg,rgba(17,24,39,0.98),rgba(25,35,49,0.92))]">
          <CardContent className="px-5 py-5 sm:px-6 sm:py-6">
            {currentSong ? (
              <div className="space-y-5">
                <div className="flex flex-col gap-5 sm:flex-row">
                  <div className="relative h-40 w-40 shrink-0 overflow-hidden rounded-[24px] border border-white/10 bg-white/8 shadow-[0_18px_60px_-32px_rgba(0,0,0,0.65)]">
                    {coverUrl ? (
                      <img src={proxyImage(coverUrl)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-5xl">🎵</div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-3 text-[11px] uppercase tracking-[0.22em] text-white/80">
                      {sourceLabel}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 space-y-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="border-white/10 bg-white/10 text-white">
                          {isPlaying ? "同步播放中" : "已暂停"}
                        </Badge>
                        {songSubmittedBy && (
                          <Badge variant="outline" className="border-white/20 bg-transparent text-white/85">
                            点歌人 {songSubmittedBy.username}
                          </Badge>
                        )}
                      </div>
                      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{currentSong.name}</h2>
                      <p className="text-sm text-white/80 sm:text-base">{currentSong.artists}</p>
                      <p className="text-xs text-white/55">{currentSong.album}</p>
                    </div>

                    <div className="space-y-2">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/12">
                        <div className="h-full rounded-full bg-[linear-gradient(90deg,#f6d365,#fda085)] transition-all duration-1000" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-xs text-white/65">
                        <span className="font-mono tabular-nums">{fmt(progressPosition)}</span>
                        <span className="font-mono tabular-nums">{fmtTotal(duration)}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Button variant="secondary" size="lg" onClick={onSkipVote} className="bg-white text-slate-900 hover:bg-white/90">
                        投票切歌 {skipVotes}/{skipThreshold}
                      </Button>
                      {isCurrentUserSong && (
                        <Button variant="ghost" size="lg" onClick={onForceSkip} className="border border-white/20 bg-white/8 text-white hover:bg-white/14">
                          我直接跳过
                        </Button>
                      )}
                      <div className="ml-auto flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3 py-2 text-xs text-white/75">
                        <span>音量</span>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={volume}
                          onChange={(event) => {
                            const nextVolume = Number(event.target.value);
                            setVolume(nextVolume);
                            localStorage.setItem("music-volume", String(nextVolume));
                          }}
                          className="h-1 w-24 cursor-pointer accent-orange-300"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <Separator className="bg-white/12" />

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.9fr)]">
                  <div className="rounded-[22px] border border-white/10 bg-black/18 px-4 py-4">
                    <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-white/45">Now Singing</p>
                    <p className="min-h-[3rem] text-lg leading-7 text-white/88 italic">
                      {currentLine || "当前歌曲没有歌词，或者歌词还没加载出来。"}
                    </p>
                  </div>

                  <div className="rounded-[22px] border border-white/10 bg-black/18 px-4 py-4">
                    <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-white/45">Turn Owner</p>
                    {songSubmittedBy ? (
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12 border border-white/15">
                          <AvatarImage src={songSubmittedBy.avatar || ""} />
                          <AvatarFallback>{songSubmittedBy.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-sm font-medium text-white">{songSubmittedBy.username}</div>
                          <div className="text-xs text-white/55">当前轮播拥有者</div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-white/55">还没有歌曲进入轮播。</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[22rem] flex-col items-center justify-center rounded-[24px] border border-dashed border-white/16 bg-black/12 px-6 text-center">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/6 text-4xl shadow-[0_10px_40px_-20px_rgba(0,0,0,0.7)]">
                  🎧
                </div>
                <p className="text-xl font-medium text-white">房间已开，但还没人把音乐推上舞台。</p>
                <p className="mt-2 max-w-md text-sm leading-6 text-white/60">
                  先在右侧搜索或导入收藏夹，再加入房间。现在的轮播逻辑已经改成播完自动把歌挪到队尾，更像持续播放的歌单。
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border border-border/60 bg-background/90 shadow-[0_18px_70px_-40px_rgba(15,23,42,0.45)] backdrop-blur-xl">
          <CardContent className="px-4 py-5 sm:px-5 sm:py-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Room Presence</p>
                <h3 className="mt-1 text-lg font-semibold">当前在场的人</h3>
              </div>
              <Badge variant="outline">{activeUsers.length} 位</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {activeUsers.length > 0 ? (
                activeUsers.map((user) => {
                  const isCurrent = user.id === currentUserId;
                  return (
                    <div key={user.id} className={`flex items-center gap-3 rounded-[22px] border px-3 py-3 ${isCurrent ? "border-primary/40 bg-primary/8" : "border-border/60 bg-muted/30"}`}>
                      <div className="relative">
                        <Avatar className={`h-11 w-11 ${isCurrent ? "ring-2 ring-primary/55 ring-offset-2 ring-offset-background" : ""}`}>
                          <AvatarImage src={user.avatar || ""} />
                          <AvatarFallback>{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        {isCurrent && <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-background bg-primary" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{user.username}</div>
                        <div className="text-xs text-muted-foreground">{isCurrent ? "正在占据当前轮次" : "等待轮到"}</div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-[22px] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  房间里还没有人，先加入再说。
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function refetchBiliUrl(song: Song, isPlaying: boolean, serverPosition: number, playbackToken: number) {
  const params = new URLSearchParams();
  params.set("source", "bilibili");
  params.set("bvid", song.bvid || "");
  params.set("cid", String(song.cid ?? ""));

  try {
    const response = await fetch(apiUrl(`/api/music/song?${params.toString()}`));
    const data = await response.json();
    if (!data.url || !singletonAudio || playbackToken !== singletonPlaybackToken) return;
    loadBiliAudio(singletonAudio, String(data.url), isPlaying, serverPosition);
  } catch {}
}

function loadBiliAudio(audio: HTMLAudioElement, rawUrl: string, isPlaying: boolean, serverPosition: number) {
  const encoded = btoa(rawUrl);
  audio.src = apiUrl(`/api/music/stream?url=${encodeURIComponent(encoded)}`);
  audio.currentTime = serverPosition || 0;
  if (isPlaying) audio.play().catch(() => {});
}
