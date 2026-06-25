"use client";

import { apiUrl, proxyImage } from "@/lib/url";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ParticleBackground } from "@/components/music/particle-background";

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
  onPlaybackEnded: () => void;
  skipVotes: number;
  skipThreshold: number;
  activeUsers: ActiveUser[];
  currentUserId: string | null;
  songSubmittedBy?: { username: string; avatar: string | null };
}

interface MusicPlayerRuntime {
  audio: HTMLAudioElement;
  lastKey: string | null;
  coverUrl: string | null;
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
    coverUrl: null,
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

function getSongKey(song: Song) {
  return song.source === "bilibili"
    ? `bili:${song.bvid ?? song.id}`
    : `ncm:${song.id}`;
}

function loadAudioSource(
  audio: HTMLAudioElement,
  sourceUrl: string,
  position: number,
  shouldPlay: boolean,
) {
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
  onPlaybackEnded,
  skipVotes,
  skipThreshold,
  activeUsers,
  currentUserId,
  songSubmittedBy,
}: Props) {
  const runtime = typeof window === "undefined" ? null : getRuntime();
  const [position, setPosition] = useState(() => {
    if (!runtime || !currentSong) return 0;
    return runtime.lastKey === getSongKey(currentSong) ? runtime.audio.currentTime : 0;
  });
  const [volume, setVolume] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("music-volume");
      if (saved) return Number(saved);
    }

    return 0.7;
  });
  const [coverUrl, setCoverUrlState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return getRuntime().coverUrl;
  });
  const [lyric, setLyric] = useState<string | null>(null);
  const [currentLine, setCurrentLine] = useState("");
  const currentSongRef = useRef(currentSong);
  const isPlayingRef = useRef(isPlaying);
  const serverPositionRef = useRef(serverPosition);
  const errorRetries = useRef(0);
  const seekFailCount = useRef(0);
  const retryTimers = useRef<number[]>([]);
  const sectionRef = useRef<HTMLElement>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const parallaxRef = useRef({ x: 0, y: 0 });
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressFrameRef = useRef<number | null>(null);
  const progressResetTimerRef = useRef<number | null>(null);
  const pendingProgressStartRef = useRef(false);
  const positionSecondRef = useRef(-1);
  const currentSongKey = currentSong ? getSongKey(currentSong) : null;
  const duration = currentSong?.duration || 0;

  const clearRetryTimers = () => {
    retryTimers.current.forEach((timer) => window.clearTimeout(timer));
    retryTimers.current = [];
  };

  const setCoverUrl = (url: string | null) => {
    const runtime = getRuntime();
    runtime.coverUrl = url;
    setCoverUrlState(url);
  };

  const stopProgressLoop = useCallback(() => {
    if (progressFrameRef.current !== null) {
      window.cancelAnimationFrame(progressFrameRef.current);
      progressFrameRef.current = null;
    }
  }, []);

  const updateProgressWidth = useCallback((percent: number) => {
    const bar = progressBarRef.current;
    if (!bar) return;

    const clamped = Math.min(Math.max(percent, 0), 100);
    bar.style.width = `${clamped}%`;
  }, []);

  const startProgressLoop = useCallback(() => {
    // Clear any in-flight reset animation so we can take over
    if (progressResetTimerRef.current !== null) {
      window.clearTimeout(progressResetTimerRef.current);
      progressResetTimerRef.current = null;
    }
    pendingProgressStartRef.current = false;
    stopProgressLoop();
    // Drop any CSS transition — the RAF loop owns the bar now
    if (progressBarRef.current) progressBarRef.current.style.transition = "";

    const update = () => {
      const song = currentSongRef.current;
      if (!song || song.duration <= 0) {
        updateProgressWidth(0);
        progressFrameRef.current = null;
        return;
      }

      const audio = getRuntime().audio;
      // Use the browser-detected duration when available — streamed files may
      // differ from song metadata.  Fall back to metadata while buffering.
      const effectiveDuration =
        audio.duration && isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : song.duration;
      const percent = Math.min((audio.currentTime / effectiveDuration) * 100, 100);
      updateProgressWidth(percent);

      if (percent >= 100 || !audio.src || audio.paused) {
        progressFrameRef.current = null;
        return;
      }

      progressFrameRef.current = window.requestAnimationFrame(update);
    };

    progressFrameRef.current = window.requestAnimationFrame(update);
  }, [stopProgressLoop, updateProgressWidth]);

  const resetProgressThenWaitForSource = useCallback(() => {
    // Clear any in-flight reset timer
    if (progressResetTimerRef.current !== null) {
      window.clearTimeout(progressResetTimerRef.current);
      progressResetTimerRef.current = null;
    }
    stopProgressLoop();
    pendingProgressStartRef.current = true;

    const bar = progressBarRef.current;
    if (!bar) {
      updateProgressWidth(0);
      return;
    }

    bar.style.transition = "width 520ms cubic-bezier(0.22, 1, 0.36, 1)";
    bar.style.width = "0%";

    progressResetTimerRef.current = window.setTimeout(() => {
      progressResetTimerRef.current = null;
      if (progressBarRef.current) progressBarRef.current.style.transition = "";
      if (pendingProgressStartRef.current && getRuntime().audio.src) {
        startProgressLoop();
      }
    }, 520);
  }, [startProgressLoop, stopProgressLoop, updateProgressWidth]);

  // Sync the progress bar DOM to the current audio position before the
  // first paint, so the user never sees a flash of an incorrect bar.
  // On song changes we intentionally leave the bar alone here — the
  // resetProgressThenWaitForSource call in the next effect will animate
  // it from its current position to 0.
  useLayoutEffect(() => {
    const bar = progressBarRef.current;
    if (!bar) return;

    if (!currentSong || duration <= 0) {
      bar.style.width = "0%";
      return;
    }

    const runtime = getRuntime();
    if (runtime.lastKey !== currentSongKey) {
      // New song — don't touch the bar; let resetProgressThenWaitForSource
      // run the animated transition from the current position to 0.
      return;
    }

    // Same song continuing (e.g. page navigation back to /music) — show current position
    const pct = Math.min((runtime.audio.currentTime / duration) * 100, 100);
    bar.style.width = `${pct}%`;
    // currentSongKey + duration capture song identity; we intentionally
    // avoid depending on the currentSong object reference (it changes on
    // every poll, but the identity fields stay stable for the same song).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSongKey, duration]);

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

    const onTime = () => {
      const nextSecond = Math.floor(audio.currentTime);
      if (nextSecond !== positionSecondRef.current) {
        positionSecondRef.current = nextSecond;
        setPosition(audio.currentTime);
      }
    };
    const onEnd = () => {
      clearRetryTimers();
      stopProgressLoop();
      // RAF already painted the bar at or extremely close to 100 % on its
      // last frame.  Don't touch it — any extra set / transition here is a
      // visible artefact.  resetProgressThenWaitForSource will animate it
      // to 0 % when the next song arrives.
      onPlaybackEnded();
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
        void refetchBiliUrl(
          song,
          serverPositionRef.current,
          expectedToken,
          runtime.sourceController.signal,
        );
      }
    };

    const onPlay = () => startProgressLoop();
    const onPause = () => stopProgressLoop();

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", onError);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      clearRetryTimers();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [onPlaybackEnded, startProgressLoop, stopProgressLoop, updateProgressWidth]);

  // Progress bar is paint-only: width is updated from the audio clock via
  // requestAnimationFrame while playback is active. React does not drive the
  // bar style, avoiding unnecessary re-renders and keeping animation at
  // native FPS.
  useEffect(() => {
    if (!currentSong) {
      stopProgressLoop();
      updateProgressWidth(0);
      return;
    }

    if (getRuntime().lastKey !== currentSongKey) return;

    if (isPlaying) startProgressLoop();
    return stopProgressLoop;
  }, [currentSong, currentSongKey, isPlaying, startProgressLoop, stopProgressLoop, updateProgressWidth]);

  useEffect(() => {
    const runtime = getRuntime();
    const audio = runtime.audio;

    if (!currentSong) {
      runtime.playbackToken += 1;
      runtime.lastKey = null;
      abortInflightRequests(runtime);
      clearRetryTimers();
      resetAudio(audio);
      errorRetries.current = 0;
      seekFailCount.current = 0;
      setPosition(0);
      setCoverUrl(null);
      setLyric(null);
      setCurrentLine("");
      resetProgressThenWaitForSource();
      return;
    }

    const songKey = getSongKey(currentSong);

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
    errorRetries.current = 0;
    seekFailCount.current = 0;
    setPosition(0);
    setLyric(null);
    setCurrentLine("");
    resetAudio(audio);
    resetProgressThenWaitForSource();

    runtime.sourceController = new AbortController();

    if (currentSong.source === "bilibili") {
      void refetchBiliUrl(
        currentSong,
        serverPositionRef.current,
        playbackToken,
        runtime.sourceController.signal,
        startProgressLoop,
      );
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
        startProgressLoop();
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          // Ignore source errors here; audio element error handler will retry when possible.
        }
      });
  }, [currentSong, resetProgressThenWaitForSource, startProgressLoop]);

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
      const line = lines.reduce(
        (prev, entry) => (entry.time <= current ? entry : prev),
        lines[0],
      );
      setCurrentLine(line.text || "");
    };

    update();
    audio.addEventListener("timeupdate", update);
    return () => audio.removeEventListener("timeupdate", update);
  }, [lyric]);

  // Correct large clock drifts between audio element and server authority.
  // Only triggers when the gap is significant and we're not near the song end,
  // so it doesn't cause perceptible jumps during normal playback.
  useEffect(() => {
    const audio = getRuntime().audio;
    if (!audio.src || duration <= 0) return;

    const drift = Math.abs(audio.currentTime - serverPosition);
    // Guard: don't seek near the end — the ended event will handle it naturally
    if (drift > 5 && seekFailCount.current < 3 && audio.currentTime < duration - 10) {
      seekFailCount.current += 1;
      audio.currentTime = serverPosition;
      startProgressLoop();
    }
  }, [serverPosition, duration, startProgressLoop]);

  const sourceLabel =
    currentSong?.source === "bilibili" ? "Bilibili 音频" : "网易云音乐";

  return (
    <section
      ref={sectionRef}
      onMouseEnter={(e) => {
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
      }}
      onMouseMove={(e) => {
        const section = sectionRef.current;
        if (!section) return;

        const previous = lastPointerRef.current;
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        if (!previous) return;

        const rect = section.getBoundingClientRect();
        const sensitivity = 0.005;
        const maxX = 5;
        const maxY = 5;
        const clamp = (value: number, max: number) =>
          Math.min(Math.max(value, -max), max);

        const nextX = clamp(
          parallaxRef.current.x -
            ((e.clientX - previous.x) / rect.width) * 100 * sensitivity,
          maxX,
        );
        const nextY = clamp(
          parallaxRef.current.y -
            ((e.clientY - previous.y) / rect.height) * 100 * sensitivity,
          maxY,
        );

        parallaxRef.current = { x: nextX, y: nextY };
        section.style.setProperty("--parallax-x", `${nextX}%`);
        section.style.setProperty("--parallax-y", `${nextY}%`);
      }}
      onMouseLeave={() => {
        lastPointerRef.current = null;
      }}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-rose-400 text-white dark:bg-slate-950 dark:bg-none"
    >
      {coverUrl ? (
        <div aria-hidden className="music-cover-float absolute -inset-[10%]">
          <div
            className="music-cover-breathe absolute inset-0 bg-cover bg-center opacity-60 blur-xl"
            style={{
              backgroundImage: `url(${proxyImage(coverUrl)})`,
            }}
          />
        </div>
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/25 to-black/45 dark:from-slate-950/55 dark:via-slate-950/65 dark:to-slate-950/90" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/15 to-transparent dark:from-white/6" />

      <ParticleBackground active={isPlaying} />

      <div className="relative flex min-h-0 flex-1 flex-col px-4 pb-5 pt-4 sm:px-6 sm:pb-6 lg:px-8 lg:pt-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-3">
            {activeUsers.length > 0 ? (
              activeUsers.map((user) => {
                const isCurrent = user.id === currentUserId;
                return (
                  <div
                    key={user.id}
                    className="flex min-w-0 items-center gap-2.5"
                  >
                    <div className="relative shrink-0">
                      <Avatar
                        className={`h-10 w-10 border border-white/12 ${isCurrent ? "ring-2 ring-amber-300/85 ring-offset-2 ring-offset-[#08111f]" : ""}`}
                      >
                        <AvatarImage src={user.avatar || ""} />
                        <AvatarFallback>
                          {user.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {isCurrent ? (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.85)]" />
                      ) : null}
                    </div>
                    <span
                      className={`max-w-[7rem] truncate text-sm ${isCurrent ? "font-medium text-white" : "text-white/72"}`}
                    >
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
              <Button
                variant="outline"
                onClick={onLeaveRoom}
                className="border-white/16 bg-white/6 text-white hover:bg-white/12 hover:text-white"
              >
                离开房间
              </Button>
            ) : (
              <Button
                onClick={onJoinRoom}
                disabled={!canJoin}
                className="bg-white text-slate-950 hover:bg-white/90"
              >
                {canJoin ? "加入音乐室" : "登录后加入"}
              </Button>
            )}
          </div>
        </div>

        {currentSong ? (
          <>
            <div className="grid min-h-0 flex-1 -translate-y-16 gap-8 pt-8 xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] xl:items-center">
              <div className="mx-auto flex w-full max-w-[19rem] flex-col gap-5">
                <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/6 shadow-[0_28px_80px_rgba(0,0,0,0.36)] backdrop-blur-sm">
                  <div className="aspect-square">
                    {coverUrl ? (
                      <img
                        src={proxyImage(coverUrl)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-white/6 text-6xl">
                        ♪
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 text-xs text-white/58">
                  <span>{sourceLabel}</span>
                  <span>
                    {songSubmittedBy
                      ? `点歌人 ${songSubmittedBy.username}`
                      : ""}
                  </span>
                </div>
              </div>

              <div className="flex min-h-0 flex-col justify-center gap-6">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/58">
                    {joined ? <span>已加入房间</span> : <span>旁听中</span>}
                    {songSubmittedBy ? (
                      <span className="h-1 w-1 rounded-full bg-white/35" />
                    ) : null}
                    {songSubmittedBy ? (
                      <span>{songSubmittedBy.username}</span>
                    ) : null}
                  </div>
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
                      {currentSong.name}
                    </h1>
                    <p className="mt-3 text-base text-white/78 sm:text-lg">
                      {currentSong.artists}
                    </p>
                    <p className="mt-1 text-sm text-white/48">
                      {currentSong.album}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 text-sm text-white/62">
                    <span>{fmt(position)}</span>
                    <span>{fmtTotal(duration)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      ref={progressBarRef}
                      className="h-full rounded-full bg-gradient-to-r from-amber-300 via-orange-300 to-sky-300 will-change-[width]"
                      style={{ width: "0%" }}
                    />
                  </div>
                </div>

                <div className="rounded-[26px] border border-white/10 bg-black/18 px-5 py-5 backdrop-blur-sm">
                  <p className="text-sm leading-8 text-white/88 sm:text-lg sm:leading-9">
                    {currentLine ||
                      "当前歌曲没有可用歌词，或者歌词还没加载出来。"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    size="lg"
                    onClick={onSkipVote}
                    className="bg-white text-slate-950 hover:bg-white/90"
                  >
                    投票切歌 {skipVotes}/{skipThreshold}
                  </Button>
                  {isCurrentUserSong ? (
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={onForceSkip}
                      className="border-white/16 bg-white/6 text-white hover:bg-white/12 hover:text-white"
                    >
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
                        localStorage.setItem(
                          "music-volume",
                          String(nextVolume),
                        );
                      }}
                      className="h-1.5 flex-1 cursor-pointer accent-amber-300"
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 -translate-y-28 flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/6 text-5xl shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
              ♪
            </div>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white">
              还没有正在播放的歌
            </h1>
            <p className="mt-3 max-w-md text-sm leading-7 text-white/58">
              从右侧歌单加歌，房间会按顺序接力播放，播完后自动移到队尾。
            </p>
            {!joined ? (
              <Button
                onClick={onJoinRoom}
                disabled={!canJoin}
                className="mt-6 bg-white text-slate-950 hover:bg-white/90"
              >
                {canJoin ? "加入音乐室" : "登录后加入"}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

async function refetchBiliUrl(
  song: Song,
  serverPosition: number,
  playbackToken: number,
  signal: AbortSignal,
  onReady?: () => void,
) {
  const params = new URLSearchParams();
  params.set("source", "bilibili");
  params.set("bvid", song.bvid || "");
  params.set("cid", String(song.cid ?? ""));

  try {
    const response = await fetch(
      apiUrl(`/api/music/song?${params.toString()}`),
      { signal },
    );
    const data = await response.json();
    const runtime = getRuntime();
    if (!data.url || playbackToken !== runtime.playbackToken) return;

    loadAudioSource(
      runtime.audio,
      apiUrl(
        `/api/music/stream?url=${encodeURIComponent(btoa(String(data.url)))}`,
      ),
      serverPosition,
      true,
    );
    onReady?.();
  } catch (error) {
    if (!isAbortError(error)) {
      // Ignore and let polling / next retry recover.
    }
  }
}
