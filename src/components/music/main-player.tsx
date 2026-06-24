"use client";

import { apiUrl, proxyImage } from "@/lib/url";
import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

interface Props {
  joined: boolean;
  canJoin: boolean;
  mySongCount: number;
  currentSong: Song | null;
  isPlaying: boolean;
  isCurrentUserSong: boolean;
  serverPosition: number;
  onJoinRoom: () => void;
  onLeaveRoom: () => void;
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
  joined,
  canJoin,
  mySongCount,
  currentSong,
  isPlaying,
  isCurrentUserSong,
  serverPosition,
  onJoinRoom,
  onLeaveRoom,
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

    setPosition(audio.currentTime);

    if (runtime.lastKey === songKey) {
      // Same song — don't reset cover, otherwise state polls (which produce a
      // new currentSong reference even when content is unchanged) would replace
      // the high-res cover fetched from /detail with the search-time picUrl,
      // and could even swap a working URL for an empty one.
      return;
    }

    setCoverUrl(currentSong.picUrl || null);

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
  // Drive the progress bar from the local `position` (updated via the audio
  // element's timeupdate event ~4x/s). serverPosition is only used as a drift
  // corrector — it moves audio.currentTime, which then flows back into
  // `position`, instead of the bar jumping straight to it every poll.
  const progress = duration > 0 ? Math.min((position / duration) * 100, 100) : 0;
  const sourceLabel = currentSong?.source === "bilibili" ? "Bilibili 音频" : "网易云音乐";

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-rose-400 text-white dark:bg-slate-950 dark:bg-none">
      {coverUrl ? (
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center opacity-60 blur-3xl"
          style={{
            backgroundImage: `url(${proxyImage(coverUrl)})`,
            animation: "fg-music-aurora 24s ease-in-out infinite",
            transformOrigin: "center",
            willChange: "transform",
          }}
        />
      ) : null}
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(255,255,255,0.45),transparent_38%),radial-gradient(circle_at_82%_18%,rgba(244,114,182,0.55),transparent_42%),radial-gradient(circle_at_30%_82%,rgba(56,189,248,0.45),transparent_44%),radial-gradient(circle_at_78%_78%,rgba(251,191,36,0.40),transparent_42%)] dark:bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.16),transparent_30%),radial-gradient(circle_at_22%_18%,rgba(56,189,248,0.14),transparent_34%),radial-gradient(circle_at_78%_22%,rgba(244,114,182,0.10),transparent_30%)]"
        style={{
          animation: "fg-music-aurora-alt 32s ease-in-out infinite",
          transformOrigin: "center",
          willChange: "transform, opacity",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/25 to-black/45 dark:from-slate-950/55 dark:via-slate-950/65 dark:to-slate-950/90" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/15 to-transparent dark:from-white/6" />

      <div className="relative flex min-h-0 flex-1 flex-col px-4 pb-5 pt-4 sm:px-6 sm:pb-6 lg:px-8 lg:pt-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-3">
            {activeUsers.length > 0 ? (
              activeUsers.map((user) => {
                const isCurrent = user.id === currentUserId;
                return (
                  <div key={user.id} className="flex min-w-0 items-center gap-2.5">
                    <div className="relative shrink-0">
                      <Avatar className={`h-10 w-10 border border-white/12 ${isCurrent ? "ring-2 ring-amber-300/85 ring-offset-2 ring-offset-[#08111f]" : ""}`}>
                        <AvatarImage src={user.avatar || ""} />
                        <AvatarFallback>{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {isCurrent ? <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.85)]" /> : null}
                    </div>
                    <span className={`max-w-[7rem] truncate text-sm ${isCurrent ? "font-medium text-white" : "text-white/72"}`}>
                      {user.username}
                    </span>
                  </div>
                );
              })
            ) : (
              <span className="text-sm text-white/58">房间里还没有成员</span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-xs text-white/72">
              {activeUsers.length} 人
            </span>
            <span className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-xs text-white/72">
              我的歌单 {mySongCount}
            </span>
            {currentSong ? (
              <span className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-xs text-white/72">
                {isPlaying ? "播放中" : "暂停中"}
              </span>
            ) : null}
            {joined ? (
              <Button variant="outline" onClick={onLeaveRoom} className="border-white/16 bg-white/6 text-white hover:bg-white/12 hover:text-white">
                离开房间
              </Button>
            ) : (
              <Button onClick={onJoinRoom} disabled={!canJoin} className="bg-white text-slate-950 hover:bg-white/90">
                {canJoin ? "加入音乐室" : "登录后加入"}
              </Button>
            )}
          </div>
        </div>

        {currentSong ? (
          <>
            <div className="grid min-h-0 flex-1 gap-8 pt-8 xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] xl:items-center">
              <div className="mx-auto flex w-full max-w-[19rem] flex-col gap-5">
                <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/6 shadow-[0_28px_80px_rgba(0,0,0,0.36)] backdrop-blur-sm">
                  <div className="aspect-square">
                    {coverUrl ? (
                      <img src={proxyImage(coverUrl)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-white/6 text-6xl">♪</div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 text-xs text-white/58">
                  <span>{sourceLabel}</span>
                  <span>{songSubmittedBy ? `点歌人 ${songSubmittedBy.username}` : ""}</span>
                </div>
              </div>

              <div className="flex min-h-0 flex-col justify-center gap-6">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/58">
                    {joined ? <span>已加入房间</span> : <span>旁听中</span>}
                    {songSubmittedBy ? <span className="h-1 w-1 rounded-full bg-white/35" /> : null}
                    {songSubmittedBy ? <span>{songSubmittedBy.username}</span> : null}
                  </div>
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">{currentSong.name}</h1>
                    <p className="mt-3 text-base text-white/78 sm:text-lg">{currentSong.artists}</p>
                    <p className="mt-1 text-sm text-white/48">{currentSong.album}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 text-sm text-white/62">
                    <span>{fmt(position)}</span>
                    <span>{fmtTotal(duration)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-300 via-orange-300 to-sky-300 transition-all duration-700" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                <div className="rounded-[26px] border border-white/10 bg-black/18 px-5 py-5 backdrop-blur-sm">
                  <p className="text-sm leading-8 text-white/88 sm:text-lg sm:leading-9">
                    {currentLine || "当前歌曲没有可用歌词，或者歌词还没加载出来。"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button size="lg" onClick={onSkipVote} className="bg-white text-slate-950 hover:bg-white/90">
                    投票切歌 {skipVotes}/{skipThreshold}
                  </Button>
                  {isCurrentUserSong ? (
                    <Button size="lg" variant="outline" onClick={onForceSkip} className="border-white/16 bg-white/6 text-white hover:bg-white/12 hover:text-white">
                      直接跳过
                    </Button>
                  ) : null}
                  <div className="ml-auto flex min-w-[14rem] items-center gap-3 rounded-full border border-white/10 bg-black/18 px-4 py-3 text-sm text-white/72 backdrop-blur-sm">
                    <span className="shrink-0 text-xs text-white/50">音量</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={volume}
                      onChange={(event) => {
                        const nextVolume = Number(event.target.value);
                        setVolume(nextVolume);
                        localStorage.setItem("music-volume", String(nextVolume));
                      }}
                      className="h-1.5 flex-1 cursor-pointer accent-amber-300"
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/6 text-5xl shadow-[0_20px_50px_rgba(0,0,0,0.28)]">♪</div>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white">还没有正在播放的歌</h1>
            <p className="mt-3 max-w-md text-sm leading-7 text-white/58">
              从右侧歌单加歌，房间会按顺序接力播放，播完后自动移到队尾。
            </p>
            {!joined ? (
              <Button onClick={onJoinRoom} disabled={!canJoin} className="mt-6 bg-white text-slate-950 hover:bg-white/90">
                {canJoin ? "加入音乐室" : "登录后加入"}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </section>
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
