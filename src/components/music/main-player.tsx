"use client";

import { apiUrl, proxyImage } from "@/lib/url";
import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

interface MusicPlayerRuntime {
  audio: HTMLAudioElement;
  lastKey: string | null;
  playbackToken: number;
  sourceController: AbortController | null;
  detailController: AbortController | null;
  lyricController: AbortController | null;
}

declare global {
  interface Window {
    __fgMusicPlayerRuntime?: MusicPlayerRuntime;
  }
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

function createRuntime(): MusicPlayerRuntime {
  const audio = new Audio();
  audio.volume = 0.7;
  audio.preload = "auto";

  return {
    audio,
    lastKey: null,
    playbackToken: 0,
    sourceController: null,
    detailController: null,
    lyricController: null,
  };
}

function getRuntime(): MusicPlayerRuntime {
  if (typeof window === "undefined") {
    return createRuntime();
  }

  if (!window.__fgMusicPlayerRuntime) {
    window.__fgMusicPlayerRuntime = createRuntime();
  }

  return window.__fgMusicPlayerRuntime;
}

function abortController(controller: AbortController | null) {
  controller?.abort();
}

function abortInflightRequests(runtime: MusicPlayerRuntime) {
  abortController(runtime.sourceController);
  abortController(runtime.detailController);
  abortController(runtime.lyricController);
  runtime.sourceController = null;
  runtime.detailController = null;
  runtime.lyricController = null;
}

function resetAudio(audio: HTMLAudioElement) {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  audio.currentTime = 0;
}

function loadAudioSource(audio: HTMLAudioElement, sourceUrl: string, position: number, shouldPlay: boolean) {
  audio.pause();
  audio.src = sourceUrl;
  audio.currentTime = position || 0;

  if (shouldPlay) {
    audio.play().catch(() => {});
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
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
  const isPlayingRef = useRef(isPlaying);
  const serverPositionRef = useRef(serverPosition);
  const endedRetries = useRef(0);
  const errorRetries = useRef(0);
  const seekFailCount = useRef(0);
  const retryTimers = useRef<number[]>([]);

  const clearRetryTimers = () => {
    retryTimers.current.forEach((timer) => window.clearTimeout(timer));
    retryTimers.current = [];
  };

  useEffect(() => {
    currentSongRef.current = currentSong;
  }, [currentSong]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    serverPositionRef.current = serverPosition;
  }, [serverPosition]);

  useEffect(() => {
    const runtime = getRuntime();
    runtime.audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const runtime = getRuntime();
    const audio = runtime.audio;
    setPosition(audio.currentTime);

    const onTime = () => setPosition(audio.currentTime);
    const onEnd = () => {
      clearRetryTimers();

      const song = currentSongRef.current;
      const playedEnough = song && song.duration > 0 && audio.currentTime >= song.duration * 0.9;
      if (!playedEnough && endedRetries.current < 3) {
        endedRetries.current += 1;
        const expectedToken = runtime.playbackToken;
        const timer = window.setTimeout(() => {
          const latest = getRuntime();
          if (latest.playbackToken !== expectedToken) return;
          if (latest.audio.src && latest.audio.paused) {
            latest.audio.play().catch(() => {});
          }
        }, 1000);
        retryTimers.current.push(timer);
      }
    };

    const onError = () => {
      clearRetryTimers();
      const expectedToken = runtime.playbackToken;

      if (errorRetries.current < 3) {
        errorRetries.current += 1;
        const timer = window.setTimeout(() => {
          const latest = getRuntime();
          if (latest.playbackToken !== expectedToken) return;
          if (latest.audio.src && latest.audio.paused) {
            latest.audio.play().catch(() => {});
          }
        }, 2000);
        retryTimers.current.push(timer);
        return;
      }

      const song = currentSongRef.current;
      if (song?.source === "bilibili") {
        errorRetries.current = 0;
        abortController(runtime.sourceController);
        runtime.sourceController = new AbortController();
        void refetchBiliUrl(song, serverPositionRef.current, expectedToken, runtime.sourceController.signal);
      }
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", onError);

    return () => {
      clearRetryTimers();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("error", onError);
    };
  }, []);

  useEffect(() => {
    const runtime = getRuntime();
    const audio = runtime.audio;

    if (!currentSong) {
      runtime.playbackToken += 1;
      runtime.lastKey = null;
      abortInflightRequests(runtime);
      clearRetryTimers();
      resetAudio(audio);
      endedRetries.current = 0;
      errorRetries.current = 0;
      seekFailCount.current = 0;
      setPosition(0);
      setCoverUrl(null);
      setLyric(null);
      setCurrentLine("");
      return;
    }

    const songKey = currentSong.source === "bilibili"
      ? `bili:${currentSong.bvid ?? currentSong.id}`
      : `ncm:${currentSong.id}`;

    setCoverUrl(currentSong.source === "bilibili" ? currentSong.picUrl || null : null);
    setPosition(audio.currentTime);

    if (runtime.lastKey === songKey) {
      return;
    }

    runtime.playbackToken += 1;
    const playbackToken = runtime.playbackToken;
    runtime.lastKey = songKey;
    abortInflightRequests(runtime);
    clearRetryTimers();
    endedRetries.current = 0;
    errorRetries.current = 0;
    seekFailCount.current = 0;
    setPosition(0);
    setLyric(null);
    setCurrentLine("");
    resetAudio(audio);

    runtime.sourceController = new AbortController();

    if (currentSong.source === "bilibili") {
      void refetchBiliUrl(currentSong, serverPositionRef.current, playbackToken, runtime.sourceController.signal);
      return;
    }

    runtime.detailController = new AbortController();
    const detailParams = new URLSearchParams();
    detailParams.set("id", String(currentSong.id));
    fetch(apiUrl(`/api/music/song/detail?${detailParams.toString()}`), {
      signal: runtime.detailController.signal,
    })
      .then((response) => response.json())
      .then((data) => {
        if (playbackToken !== getRuntime().playbackToken) return;
        if (data.picUrl) setCoverUrl(data.picUrl);
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          // Ignore detail errors, playback should continue.
        }
      });

    const params = new URLSearchParams();
    params.set("id", String(currentSong.id));
    fetch(apiUrl(`/api/music/song?${params.toString()}`), {
      signal: runtime.sourceController.signal,
    })
      .then((response) => response.json())
      .then((data) => {
        const latest = getRuntime();
        if (!data.url || playbackToken !== latest.playbackToken) return;

        loadAudioSource(
          latest.audio,
          String(data.url).replace(/^http:/, "https:"),
          serverPositionRef.current,
          isPlayingRef.current,
        );
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          // Ignore source errors here; audio element error handler will retry when possible.
        }
      });
  }, [currentSong]);

  useEffect(() => {
    const runtime = getRuntime();
    abortController(runtime.lyricController);

    if (!currentSong) {
      setLyric(null);
      return;
    }

    runtime.lyricController = new AbortController();
    const lyricParams = new URLSearchParams();
    if (currentSong.source === "bilibili") {
      lyricParams.set("source", "bilibili");
    } else {
      lyricParams.set("id", String(currentSong.id));
    }

    fetch(apiUrl(`/api/music/lyric?${lyricParams.toString()}`), {
      signal: runtime.lyricController.signal,
    })
      .then((response) => response.json())
      .then((data) => setLyric(data.lyric || null))
      .catch((error) => {
        if (!isAbortError(error)) {
          setLyric(null);
        }
      });
  }, [currentSong]);

  useEffect(() => {
    const runtime = getRuntime();
    const audio = runtime.audio;
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

    const audio = getRuntime().audio;
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
    const audio = getRuntime().audio;
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
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_19rem]">
      <Card className="overflow-hidden rounded-[30px] border-0 bg-[linear-gradient(145deg,#09131c_0%,#10202c_48%,#162a2d_100%)] text-white shadow-[0_30px_100px_-46px_rgba(2,6,23,0.95)]">
        <CardContent className="p-0">
          {currentSong ? (
            <div className="grid gap-0 lg:grid-cols-[18rem_minmax(0,1fr)]">
              <div className="relative border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_55%)]" />
                <div className="relative space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-white text-slate-950 hover:bg-white">{isPlaying ? "正在同步播放" : "暂停中"}</Badge>
                    <Badge variant="outline" className="border-white/16 bg-white/6 text-white/80">
                      {sourceLabel}
                    </Badge>
                  </div>

                  <div className="relative overflow-hidden rounded-[26px] border border-white/10 bg-white/6 shadow-[0_20px_60px_-32px_rgba(0,0,0,0.7)]">
                    <div className="aspect-square">
                      {coverUrl ? (
                        <img src={proxyImage(coverUrl)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-6xl">🎵</div>
                      )}
                    </div>
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(4,10,18,0.9)_100%)]" />
                    <div className="absolute inset-x-0 bottom-0 px-4 py-4">
                      <p className="text-[11px] uppercase tracking-[0.28em] text-white/48">Current Turn</p>
                      <p className="mt-2 text-sm font-medium text-white">{songSubmittedBy?.username || "房间轮播"}</p>
                      <p className="text-xs text-white/58">当前正在占据播放位</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex min-h-full flex-col justify-between p-5 sm:p-6">
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-[11px] uppercase tracking-[0.3em] text-white/42">Now Playing</p>
                      <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-[2.35rem]">{currentSong.name}</h2>
                      <p className="text-base text-white/76">{currentSong.artists}</p>
                      <p className="text-sm text-white/45">{currentSong.album}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="lg" onClick={onSkipVote} className="bg-white text-slate-950 hover:bg-white/90">
                        投票切歌 {skipVotes}/{skipThreshold}
                      </Button>
                      {isCurrentUserSong && (
                        <Button variant="ghost" size="lg" onClick={onForceSkip} className="border border-white/14 bg-white/8 text-white hover:bg-white/14">
                          直接跳过
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-[24px] border border-white/10 bg-black/18 p-4">
                    <div className="flex items-center justify-between text-xs text-white/56">
                      <span>播放进度</span>
                      <span className="font-mono tabular-nums">{fmt(progressPosition)} / {fmtTotal(duration)}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#f59e0b_0%,#fb7185_50%,#60a5fa_100%)] transition-all duration-700"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                    <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                      <p className="text-[11px] uppercase tracking-[0.28em] text-white/42">当前歌词</p>
                      <p className="mt-3 min-h-[5.5rem] text-lg leading-8 text-white/88">
                        {currentLine || "当前歌曲没有可用歌词，或者歌词还没加载出来。"}
                      </p>
                    </div>

                    <div className="space-y-3 rounded-[24px] border border-white/10 bg-white/6 p-4">
                      <p className="text-[11px] uppercase tracking-[0.28em] text-white/42">房间控制</p>
                      <div className="rounded-[18px] border border-white/10 bg-black/20 px-3 py-3">
                        <div className="text-xs text-white/48">音量</div>
                        <div className="mt-2 flex items-center gap-3">
                          <span className="text-xs text-white/55">静</span>
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
                            className="h-1.5 flex-1 cursor-pointer accent-amber-300"
                          />
                          <span className="text-xs text-white/55">强</span>
                        </div>
                      </div>

                      {songSubmittedBy ? (
                        <div className="flex items-center gap-3 rounded-[18px] border border-white/10 bg-black/20 px-3 py-3">
                          <Avatar className="h-11 w-11 border border-white/10">
                            <AvatarImage src={songSubmittedBy.avatar || ""} />
                            <AvatarFallback>{songSubmittedBy.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-white">{songSubmittedBy.username}</p>
                            <p className="truncate text-xs text-white/50">当前轮播拥有者</p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[30rem] flex-col items-center justify-center px-6 py-12 text-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/6 text-5xl shadow-[0_18px_50px_-30px_rgba(0,0,0,0.7)]">
                🎧
              </div>
              <p className="mt-6 text-2xl font-semibold text-white">房间已开，但舞台还是空的。</p>
              <p className="mt-3 max-w-xl text-sm leading-7 text-white/60">
                先去右侧找歌并加入轮播。播完的歌曲会自动转去队尾，所以歌单会像持续滚动的房间队列，而不是一次性播空。
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border border-white/40 bg-background/86 shadow-[0_22px_80px_-44px_rgba(15,23,42,0.5)] backdrop-blur-xl dark:border-white/8 dark:bg-white/[0.04]">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.26em] text-muted-foreground">Room Presence</p>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">当前在场的人</h3>
              <Badge variant="outline">{activeUsers.length} 位</Badge>
            </div>
          </div>

          <div className="space-y-3">
            {activeUsers.length > 0 ? (
              activeUsers.map((user) => {
                const isCurrent = user.id === currentUserId;
                return (
                  <div
                    key={user.id}
                    className={`flex items-center gap-3 rounded-[20px] border px-3 py-3 transition ${
                      isCurrent ? "border-primary/35 bg-primary/8" : "border-border/60 bg-background/72"
                    }`}
                  >
                    <div className="relative">
                      <Avatar className={`h-11 w-11 ${isCurrent ? "ring-2 ring-primary/55 ring-offset-2 ring-offset-background" : ""}`}>
                        <AvatarImage src={user.avatar || ""} />
                        <AvatarFallback>{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {isCurrent ? <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-background bg-primary" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{user.username}</div>
                      <div className="text-xs text-muted-foreground">{isCurrent ? "当前轮到他" : "等待轮到"}</div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-[22px] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                还没有人在房间里，先加入再说。
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

async function refetchBiliUrl(song: Song, serverPosition: number, playbackToken: number, signal: AbortSignal) {
  const params = new URLSearchParams();
  params.set("source", "bilibili");
  params.set("bvid", song.bvid || "");
  params.set("cid", String(song.cid ?? ""));

  try {
    const response = await fetch(apiUrl(`/api/music/song?${params.toString()}`), { signal });
    const data = await response.json();
    const runtime = getRuntime();
    if (!data.url || playbackToken !== runtime.playbackToken) return;

    loadAudioSource(
      runtime.audio,
      apiUrl(`/api/music/stream?url=${encodeURIComponent(btoa(String(data.url)))}`),
      serverPosition,
      true,
    );
  } catch (error) {
    if (!isAbortError(error)) {
      // Ignore and let polling / next retry recover.
    }
  }
}
