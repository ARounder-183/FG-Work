"use client";

import { apiUrl, proxyImage } from "@/lib/url";
import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

interface UpcomingSong {
  id: string;
  name: string;
  artists: string;
  userName: string;
  duration: string;
  isCurrent: boolean;
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
  upcomingSongs?: UpcomingSong[];
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
  upcomingSongs = [],
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
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.2),transparent_30%),radial-gradient(circle_at_left,rgba(59,130,246,0.12),transparent_24%),linear-gradient(180deg,#0f172a_0%,#020617_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        {currentSong ? (
          <div className="grid gap-5 p-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-white text-slate-950 hover:bg-white">{isPlaying ? "正在同步播放" : "暂停中"}</Badge>
                <Badge variant="outline" className="border-white/20 bg-white/5 text-white/80">
                  {sourceLabel}
                </Badge>
              </div>

              <div className="overflow-hidden rounded-[20px] border border-white/10 bg-white/5">
                <div className="aspect-square">
                  {coverUrl ? (
                    <img src={proxyImage(coverUrl)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-5xl">🎵</div>
                  )}
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-5">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-white/20 bg-white/5 text-white/80">{activeUsers.length} 人在线</Badge>
                  {songSubmittedBy ? (
                    <Badge variant="outline" className="border-white/20 bg-white/5 text-white/80">
                      点歌人 {songSubmittedBy.username}
                    </Badge>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-semibold tracking-tight text-white sm:text-3xl">{currentSong.name}</h2>
                  <p className="mt-2 truncate text-base text-white/80">{currentSong.artists}</p>
                  <p className="mt-1 truncate text-sm text-white/55">{currentSong.album}</p>
                </div>
              </div>

              <div className="space-y-3 rounded-[18px] border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between text-xs text-white/60">
                  <span>播放进度</span>
                  <span className="font-mono tabular-nums">{fmt(progressPosition)} / {fmtTotal(duration)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-amber-400 transition-all duration-700" style={{ width: `${progress}%` }} />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
                <div className="rounded-[18px] border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-white/60">当前歌词</p>
                  <p className="mt-3 min-h-[4.5rem] break-words text-base leading-7 text-white/88">
                    {currentLine || "当前歌曲没有可用歌词，或者歌词还没加载出来。"}
                  </p>
                </div>

                <div className="space-y-3 rounded-[18px] border border-white/10 bg-white/5 p-4">
                  <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-3">
                    <div className="text-xs text-white/60">音量</div>
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

                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="lg" onClick={onSkipVote} className="bg-white text-slate-950">
                      投票切歌 {skipVotes}/{skipThreshold}
                    </Button>
                    {isCurrentUserSong ? (
                      <Button variant="ghost" size="lg" onClick={onForceSkip} className="border border-white/14 bg-transparent text-white">
                        直接跳过
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[22rem] flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5 text-4xl">🎧</div>
            <p className="mt-5 text-xl font-semibold text-white">房间里还没有歌曲。</p>
            <p className="mt-3 max-w-md text-sm leading-6 text-white/60">先去右侧加歌，播放完会自动移到队尾。</p>
          </div>
        )}
      </div>

      <div className="rounded-[22px] border border-border/60 bg-background/92 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {activeUsers.length > 0 ? (
            activeUsers.map((user) => {
              const isCurrent = user.id === currentUserId;
              return (
                <div
                  key={user.id}
                  className={`group relative flex items-center gap-2 rounded-full border px-2.5 py-2 ${
                    isCurrent ? "border-primary/35 bg-primary/8 shadow-[0_0_0_1px_rgba(59,130,246,0.12)]" : "border-border/60 bg-muted/20"
                  }`}
                >
                  <Avatar className={`h-10 w-10 ${isCurrent ? "ring-2 ring-primary/55 ring-offset-2 ring-offset-background" : ""}`}>
                    <AvatarImage src={user.avatar || ""} />
                    <AvatarFallback>{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  {isCurrent ? <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-background bg-primary shadow-[0_0_16px_rgba(59,130,246,0.7)]" /> : null}
                  <span className="max-w-[6rem] truncate text-sm font-medium text-foreground">{user.username}</span>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
              还没有人在房间里，先加入再说。
            </div>
          )}
        </div>

        {upcomingSongs.length > 0 ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {upcomingSongs.map((song, index) => (
              <div key={song.id} className={`rounded-2xl border px-3 py-3 ${song.isCurrent ? "border-primary/35 bg-primary/8" : "border-border/60 bg-muted/20"}`}>
                <div className="text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</div>
                <div className="mt-2 truncate text-sm font-medium">{song.name}</div>
                <div className="truncate text-xs text-muted-foreground">{song.artists}</div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{song.userName}</span>
                  <span>{song.duration}</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
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
