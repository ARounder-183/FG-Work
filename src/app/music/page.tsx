"use client";

import { apiUrl } from "@/lib/url";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MainPlayer } from "@/components/music/main-player";
import { RightPanels } from "@/components/music/right-panels";
import { ChatPanel } from "@/components/music/chat-panel";
import { BilibiliLogin } from "@/components/bilibili-login";
import { PhoneLogin } from "@/components/phone-login";
import { toast } from "sonner";

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

interface MySong {
  id: string;
  songData: string;
  sortOrder: number;
}

interface ActiveUser {
  id: string;
  username: string;
  avatar: string | null;
}

interface CurrentUserSong {
  id: string;
  userId: string;
  user: { username: string; avatar: string | null };
}

interface QueueItem {
  id: string;
  songData: string;
  userId: string;
  user: { username: string; avatar: string | null };
}

function parseSong(raw: string): Song | null {
  try {
    return JSON.parse(raw) as Song;
  } catch {
    return null;
  }
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remain = Math.floor(seconds % 60);
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

function queuePreview(fullQueue: QueueItem[], currentSong: Song | null) {
  const seen = new Set<string>();

  return fullQueue
    .filter((item) => {
      if (seen.has(item.userId)) return false;
      seen.add(item.userId);
      return true;
    })
    .map((item) => {
      const song = parseSong(item.songData);
      const isCurrent = song
        ? song.source === "bilibili"
          ? song.bvid === currentSong?.bvid
          : song.id === currentSong?.id
        : false;

      return { item, song, isCurrent };
    });
}

export default function MusicPage() {
  const { user } = useAuth();
  const [joined, setJoined] = useState(false);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mySongs, setMySongs] = useState<MySong[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [skipVotes, setSkipVotes] = useState<string[]>([]);
  const [skipThreshold, setSkipThreshold] = useState(1);
  const [currentUserSong, setCurrentUserSong] = useState<CurrentUserSong | null>(null);
  const [fullQueue, setFullQueue] = useState<QueueItem[]>([]);
  const [serverPosition, setServerPosition] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [phoneLoginOpen, setPhoneLoginOpen] = useState(false);
  const [biliLoggedIn, setBiliLoggedIn] = useState(false);
  const [biliUname, setBiliUname] = useState("");

  const fetchMySongs = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch(apiUrl("/api/music/queue"));
      if (!response.ok) return;
      const data = await response.json();
      setMySongs(data.songs || []);
    } catch {}
  }, [user]);

  const fetchState = useCallback(async () => {
    try {
      const response = await fetch(apiUrl("/api/music/state"));
      if (!response.ok) return;

      const data = await response.json();
      if (data.state) {
        setCurrentSong(data.state.currentSong);
        setIsPlaying(data.state.isPlaying || false);
        setActiveUsers(data.users || []);
        setSkipVotes(data.skipVotes || []);
        setSkipThreshold(data.skipThreshold || 1);
        setCurrentUserSong(data.currentUserSong || null);
        setFullQueue(data.fullQueue || []);
        setServerPosition(data.state?.position || 0);
      }

      setJoined(user ? data.state?.queueOrder?.includes(user.id) : false);
    } catch {
      // Next poll retries.
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    void fetchState();
    void fetchMySongs();
  }, [fetchMySongs, fetchState]);

  useEffect(() => {
    let cancelled = false;
    let stateTimer: number | null = null;
    let queueTimer: number | null = null;

    const runStatePoll = async () => {
      if (cancelled) return;
      await fetchState();
      stateTimer = window.setTimeout(runStatePoll, document.hidden ? 5000 : 3000);
    };

    const runQueuePoll = async () => {
      if (cancelled) return;
      if (!document.hidden && user) {
        await fetchMySongs();
      }
      queueTimer = window.setTimeout(runQueuePoll, document.hidden ? 20000 : 12000);
    };

    void runStatePoll();
    void runQueuePoll();

    return () => {
      cancelled = true;
      if (stateTimer !== null) window.clearTimeout(stateTimer);
      if (queueTimer !== null) window.clearTimeout(queueTimer);
    };
  }, [fetchMySongs, fetchState, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.dispatchEvent(new CustomEvent("fg-music-state", {
      detail: {
        currentSong: currentSong ? { name: currentSong.name, artists: currentSong.artists } : null,
        isPlaying,
      },
    }));
  }, [currentSong, isPlaying]);

  useEffect(() => {
    fetch(apiUrl("/api/bilibili/login/status"))
      .then((response) => response.json())
      .then((data) => {
        setBiliLoggedIn(data.loggedIn || false);
        setBiliUname(data.bilibiliUname || "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const leave = () => {
      if (joined) navigator.sendBeacon(apiUrl("/api/music/leave"));
    };

    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [joined]);

  const api = {
    join: async () => {
      await fetch(apiUrl("/api/music/join"), { method: "POST" });
      setJoined(true);
      void fetchState();
      void fetchMySongs();
      toast.success("已加入音乐室");
    },
    leave: async () => {
      await fetch(apiUrl("/api/music/leave"), { method: "POST" });
      setJoined(false);
      setCurrentSong(null);
      setIsPlaying(false);
      void fetchState();
    },
    skipVote: async () => {
      const response = await fetch(apiUrl("/api/music/skip"), { method: "POST" });
      const data = await response.json();
      toast(data.skipped ? "已切歌" : `投票 ${data.voteCount}/${data.threshold}`);
      void fetchState();
      void fetchMySongs();
    },
    forceSkip: async () => {
      const response = await fetch(apiUrl("/api/music/skip?force=true"), { method: "POST" });
      const data = await response.json();
      if (data.skipped) {
        toast.success("已强制切歌");
        void fetchState();
        void fetchMySongs();
        return;
      }

      toast.error(data.error);
    },
    addSong: async (song: Song) => {
      const response = await fetch(apiUrl("/api/music/queue"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ song }),
      });

      if (response.ok) {
        toast.success("已加入歌单");
        void fetchMySongs();
        void fetchState();
      }
    },
    addSongs: async (songs: Song[]) => {
      await fetch(apiUrl("/api/music/queue"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songs }),
      });

      toast.success(`已添加 ${songs.length} 首歌曲`);
      void fetchMySongs();
      void fetchState();
    },
    reorder: async (songs: { id: string; sortOrder: number }[]) => {
      await fetch(apiUrl("/api/music/queue"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songs }),
      });

      void fetchMySongs();
    },
    clear: async () => {
      await fetch(apiUrl("/api/music/queue?all=true"), { method: "DELETE" });
      void fetchMySongs();
      toast.success("歌单已清空");
    },
    randomize: async () => {
      const randomized = [...mySongs]
        .map((item, index) => ({ id: item.id, sortOrder: index }))
        .sort(() => Math.random() - 0.5)
        .map((item, index) => ({ id: item.id, sortOrder: index }));

      await api.reorder(randomized);
      toast.success("歌单顺序已随机");
    },
    deleteSong: async (id: string) => {
      await fetch(apiUrl(`/api/music/queue?id=${id}`), { method: "DELETE" });
      void fetchMySongs();
      toast.success("歌曲已移除");
    },
  };

  const nextSongs = queuePreview(fullQueue, currentSong);
  const totalDuration = mySongs.reduce((sum, item) => {
    const song = parseSong(item.songData);
    return sum + (song?.duration || 0);
  }, 0);
  const turnTitle = currentUserSong ? `${currentUserSong.user.username} 的轮次` : "等待开始";

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-5 px-4 py-5 lg:px-6 lg:py-6">
        <Skeleton className="h-24 rounded-[28px]" />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.48fr)_23rem]">
          <Skeleton className="h-[38rem] rounded-[34px]" />
          <Skeleton className="h-[38rem] rounded-[34px]" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(246,129,31,0.16),transparent_22%),radial-gradient(circle_at_top_right,rgba(18,163,127,0.14),transparent_24%),linear-gradient(180deg,#f7f2e8_0%,#efe8dc_42%,#f4f1eb_100%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.14),transparent_20%),radial-gradient(circle_at_top_right,rgba(20,184,166,0.16),transparent_22%),linear-gradient(180deg,#071018_0%,#09131d_54%,#050b12_100%)]">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] bg-[size:30px_30px] opacity-40 dark:opacity-15" />
        <div className="absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.48),transparent_72%)] dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_68%)]" />

        <div className="relative mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-5 px-4 py-5 lg:px-6 lg:py-6">
          <header className="overflow-hidden rounded-[28px] border border-white/40 bg-background/78 shadow-[0_18px_60px_-34px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge className="bg-foreground text-background hover:bg-foreground">共享听歌房</Badge>
                  <Badge variant="outline">{joined ? "已加入轮播" : "旁听模式"}</Badge>
                  <Badge variant="outline">{isPlaying ? "正在播放" : "暂停或待机"}</Badge>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.32em] text-muted-foreground">Music Room</p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[2rem]">主播放区要大，控制区要稳，信息顺序要像真实房间。</h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                    先看到现在放什么、谁在轮转和下一首是谁，再去右边找歌和整理队列。页面只服务这个核心流程。
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 lg:justify-end">
                {!joined ? (
                  <Button size="lg" onClick={api.join} disabled={!user}>
                    {user ? "加入房间" : "登录后加入"}
                  </Button>
                ) : (
                  <Button size="lg" variant="outline" onClick={api.leave}>
                    离开房间
                  </Button>
                )}
                <Button
                  size="lg"
                  variant="ghost"
                  onClick={() => document.getElementById("music-library")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  去加歌
                </Button>
              </div>
            </div>

            <div className="grid gap-px border-t border-border/60 bg-border/60 md:grid-cols-2 xl:grid-cols-4">
              <TopMetric label="当前轮次" value={turnTitle} detail={currentSong ? currentSong.name : "暂无歌曲进入房间"} />
              <TopMetric label="我的歌单" value={`${mySongs.length} 首`} detail={`总时长 ${formatDuration(totalDuration)}`} />
              <TopMetric label="在线状态" value={`${activeUsers.length} 人`} detail={`${skipVotes.length}/${skipThreshold} 票可切歌`} />
              <TopMetric label="B 站能力" value={biliLoggedIn ? biliUname || "已登录" : "未连接"} detail={biliLoggedIn ? "可导入收藏夹" : "登录后可导入收藏夹"} />
            </div>
          </header>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.48fr)_23rem]">
            <main className="space-y-5">
              <section className="overflow-hidden rounded-[34px] border border-white/35 bg-black/8 p-3 shadow-[0_28px_120px_-60px_rgba(15,23,42,0.82)] backdrop-blur-sm dark:border-white/8 dark:bg-white/[0.03] sm:p-4">
                <MainPlayer
                  currentSong={joined ? currentSong : null}
                  isPlaying={joined ? isPlaying : false}
                  isCurrentUserSong={currentUserSong?.userId === user?.id}
                  serverPosition={serverPosition}
                  onSkipVote={api.skipVote}
                  onForceSkip={api.forceSkip}
                  skipVotes={skipVotes.length}
                  skipThreshold={skipThreshold}
                  activeUsers={activeUsers}
                  currentUserId={currentUserSong?.userId || null}
                  songSubmittedBy={currentUserSong ? { username: currentUserSong.user.username, avatar: currentUserSong.user.avatar } : undefined}
                />
              </section>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
                <section className="overflow-hidden rounded-[28px] border border-white/40 bg-background/80 shadow-[0_18px_70px_-40px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/8 dark:bg-white/[0.04]">
                  <div className="border-b border-border/60 px-5 py-4">
                    <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Rotation</p>
                    <h2 className="mt-1 text-lg font-semibold">接下来谁放</h2>
                    <p className="mt-1 text-sm text-muted-foreground">按用户轮转，每个人只展示当前会接上的那一首。</p>
                  </div>

                  <div className="max-h-[34rem] space-y-3 overflow-y-auto px-3 py-3 sm:px-4">
                    {nextSongs.length === 0 ? (
                      <div className="flex min-h-[18rem] items-center justify-center rounded-[24px] border border-dashed border-border/70 bg-muted/25 px-5 text-center text-sm text-muted-foreground">
                        还没有轮转队列。先在右侧加歌，房间才会真的动起来。
                      </div>
                    ) : (
                      nextSongs.map(({ item, song, isCurrent }, index) => (
                        <div
                          key={item.id}
                          className={`rounded-[24px] border px-4 py-4 transition ${
                            isCurrent
                              ? "border-primary/35 bg-primary/8 shadow-[0_18px_50px_-32px_rgba(14,165,233,0.45)]"
                              : "border-border/60 bg-background/72 hover:border-primary/25 hover:bg-primary/5"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-xs font-mono text-muted-foreground">
                              {String(index + 1).padStart(2, "0")}
                            </div>
                            <Avatar className="mt-0.5 h-11 w-11 shrink-0 border border-border/60">
                              <AvatarImage src={item.user.avatar || ""} />
                              <AvatarFallback>{item.user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className={`truncate text-sm font-semibold ${isCurrent ? "text-primary" : "text-foreground"}`}>{song?.name || "解析失败的歌曲"}</p>
                                {isCurrent && <Badge variant="secondary">正在播放</Badge>}
                              </div>
                              <p className="truncate text-xs text-muted-foreground">{song?.artists || "未知作者"}</p>
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                <span>{item.user.username}</span>
                                <span>{song ? formatDuration(song.duration) : "--:--"}</span>
                                <span>{song?.source === "bilibili" ? "Bilibili" : "网易云"}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="overflow-hidden rounded-[28px] border border-white/40 bg-background/82 shadow-[0_18px_70px_-40px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/8 dark:bg-white/[0.04]">
                  <div className="border-b border-border/60 px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Room Feed</p>
                        <h2 className="mt-1 text-lg font-semibold">房间聊天</h2>
                      </div>
                      <Badge variant="secondary">实时播报</Badge>
                    </div>
                  </div>
                  <ChatPanel />
                </section>
              </div>
            </main>

            <aside id="music-library" className="min-h-0 xl:sticky xl:top-5 xl:self-start">
              <section className="overflow-hidden rounded-[30px] border border-white/40 bg-background/82 shadow-[0_20px_80px_-42px_rgba(15,23,42,0.5)] backdrop-blur-xl dark:border-white/8 dark:bg-white/[0.04]">
                <div className="border-b border-border/60 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Music Console</p>
                      <h2 className="mt-1 text-lg font-semibold">加歌与整理</h2>
                      <p className="mt-1 text-sm text-muted-foreground">搜索、导入和拖拽排序都在这里完成，不再打断主播放区。</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant={joined ? "default" : "outline"}>{joined ? "已参与轮播" : "只编辑歌单"}</Badge>
                      <Badge variant="outline">{currentUserSong?.userId === user?.id ? "轮到你" : "等待轮到"}</Badge>
                    </div>
                  </div>
                </div>

                <RightPanels
                  mySongs={mySongs}
                  currentSong={currentSong}
                  onReorder={api.reorder}
                  onClear={api.clear}
                  onRandomize={api.randomize}
                  onDelete={api.deleteSong}
                  onAddSong={api.addSong}
                  onAddSongs={api.addSongs}
                  biliLoggedIn={biliLoggedIn}
                  biliUname={biliUname}
                  onBiliLogin={() => setLoginOpen(true)}
                  onPhoneLogin={() => setPhoneLoginOpen(true)}
                  onBiliLogout={async () => {
                    try {
                      await fetch(apiUrl("/api/bilibili/login/logout"), { method: "POST" });
                      setBiliLoggedIn(false);
                      setBiliUname("");
                      toast.success("已退出 B 站登录");
                    } catch {
                      toast.error("退出失败");
                    }
                  }}
                />
              </section>
            </aside>
          </div>
        </div>
      </div>

      <BilibiliLogin
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLoginSuccess={(uname) => {
          setBiliLoggedIn(true);
          setBiliUname(uname);
        }}
      />

      <PhoneLogin
        open={phoneLoginOpen}
        onClose={() => setPhoneLoginOpen(false)}
        onLoginSuccess={(uname) => {
          setBiliLoggedIn(true);
          setBiliUname(uname);
        }}
      />
    </>
  );
}

function TopMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="space-y-2 bg-background/90 px-5 py-4 dark:bg-black/10">
      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      <p className="truncate text-base font-semibold text-foreground">{value}</p>
      <p className="truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
