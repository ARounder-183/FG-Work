"use client";

import { apiUrl } from "@/lib/url";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 lg:px-6">
        <Skeleton className="h-28 w-full rounded-[28px]" />
        <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
          <Skeleton className="h-[32rem] w-full rounded-[32px]" />
          <Skeleton className="h-[32rem] w-full rounded-[32px]" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(210,129,36,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(27,120,95,0.16),transparent_28%),linear-gradient(180deg,rgba(249,247,242,0.94),rgba(255,255,255,0.98))] dark:bg-[radial-gradient(circle_at_top_left,rgba(210,129,36,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(42,140,112,0.18),transparent_26%),linear-gradient(180deg,rgba(20,23,25,0.98),rgba(12,15,17,1))]">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(17,24,39,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,24,39,0.04)_1px,transparent_1px)] bg-[size:32px_32px] opacity-40 dark:opacity-20" />
        <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 lg:px-6">
          <section className="overflow-hidden rounded-[30px] border border-border/60 bg-background/78 shadow-[0_24px_90px_-32px_rgba(15,23,42,0.35)] backdrop-blur-xl">
            <div className="grid gap-6 px-5 py-5 lg:grid-cols-[1.15fr_0.85fr] lg:px-7 lg:py-7">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={joined ? "default" : "outline"}>{joined ? "已加入房间" : "房间外旁听"}</Badge>
                  <Badge variant="secondary">{activeUsers.length} 人在线</Badge>
                  <Badge variant="outline">{mySongs.length} 首待播</Badge>
                  {currentSong && <Badge variant="outline">播放中</Badge>}
                </div>

                <div className="space-y-2">
                  <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-muted-foreground">FG Shared Listening Room</p>
                  <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-[2.85rem]">
                    听歌页需要从“能用”提升到“像个房间”。
                  </h1>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                    把播放状态、轮转队列、聊天和加歌流程放到同一个信息层级里，避免现在这种左右两条狭窄侧栏把核心体验拆散。
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  {!joined ? (
                    <Button size="lg" onClick={api.join} disabled={!user}>
                      {user ? "加入音乐室" : "登录后加入"}
                    </Button>
                  ) : (
                    <Button size="lg" variant="outline" onClick={api.leave}>
                      离开房间
                    </Button>
                  )}
                  <Button size="lg" variant="ghost" onClick={() => document.getElementById("music-library")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                    去加歌
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <Card className="border-border/60 bg-background/70 shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">房间节奏</CardTitle>
                    <CardDescription>当前轮播状态</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="text-2xl font-semibold tabular-nums">{activeUsers.length}</div>
                    <p className="text-xs text-muted-foreground">在线用户数量</p>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-background/70 shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">我的歌单</CardTitle>
                    <CardDescription>排队长度与时长</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="text-2xl font-semibold tabular-nums">{mySongs.length}</div>
                    <p className="text-xs text-muted-foreground">总计 {formatDuration(totalDuration)}</p>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-background/70 shadow-none sm:col-span-3 lg:col-span-1 xl:col-span-1">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">B站能力</CardTitle>
                    <CardDescription>收藏夹与视频搜索</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm font-medium">{biliLoggedIn ? biliUname || "已登录 Bilibili" : "未登录 Bilibili"}</p>
                    <p className="text-xs text-muted-foreground">未登录时只能搜网易云，登录后才能把收藏夹作为稳定歌源。</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.9fr)]">
            <section className="space-y-6">
              <Card className="overflow-hidden rounded-[32px] border border-border/60 bg-background/82 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.4)] backdrop-blur-xl">
                <CardHeader className="border-b border-border/60 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-xl">主舞台</CardTitle>
                      <CardDescription>当前播放、投票切歌、房间成员状态</CardDescription>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={`h-2.5 w-2.5 rounded-full ${isPlaying ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                      {currentSong ? (isPlaying ? "正在同步播放" : "已暂停，等待继续") : "还没有开始播放"}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 py-5 sm:px-6">
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
                </CardContent>
              </Card>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <Card className="overflow-hidden rounded-[28px] border border-border/60 bg-background/80 shadow-[0_20px_70px_-38px_rgba(15,23,42,0.45)] backdrop-blur-xl">
                  <CardHeader className="border-b border-border/60 pb-4">
                    <CardTitle className="text-lg">房间聊天</CardTitle>
                    <CardDescription>实时消息和 TTS 播报合并在房间主视野里</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ChatPanel />
                  </CardContent>
                </Card>

                <Card className="overflow-hidden rounded-[28px] border border-border/60 bg-background/80 shadow-[0_20px_70px_-38px_rgba(15,23,42,0.45)] backdrop-blur-xl">
                  <CardHeader className="border-b border-border/60 pb-4">
                    <CardTitle className="text-lg">即将轮到</CardTitle>
                    <CardDescription>每个用户的下一首，方便理解轮转顺序</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[24rem] overflow-y-auto">
                      {nextSongs.length === 0 ? (
                        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                          队列还是空的，先从右侧把歌单堆起来。
                        </div>
                      ) : (
                        nextSongs.map(({ item, song, isCurrent }, index) => (
                          <div key={item.id} className={`flex items-center gap-3 px-5 py-3 ${index !== 0 ? "border-t border-border/50" : ""} ${isCurrent ? "bg-primary/8" : ""}`}>
                            <div className="w-7 text-center font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</div>
                            <div className="min-w-0 flex-1">
                              <div className={`truncate text-sm font-medium ${isCurrent ? "text-primary" : "text-foreground"}`}>
                                {song?.name || "解析失败的歌曲"}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">{song?.artists || "未知作者"}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs font-medium text-foreground">{item.user.username}</div>
                              <div className="text-[11px] text-muted-foreground">{song ? formatDuration(song.duration) : "--:--"}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            <aside id="music-library" className="min-h-0">
              <Card className="h-full overflow-hidden rounded-[32px] border border-border/60 bg-background/84 shadow-[0_24px_90px_-42px_rgba(15,23,42,0.45)] backdrop-blur-xl">
                <CardHeader className="border-b border-border/60 pb-4">
                  <div className="space-y-2">
                    <CardTitle className="text-xl">歌单工作台</CardTitle>
                    <CardDescription>搜索、导入收藏夹、整理自己的队列。这里是操作区，不再挤占主舞台。</CardDescription>
                  </div>
                  <Separator className="mt-2" />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>当前模式：</span>
                    <Badge variant={joined ? "default" : "outline"}>{joined ? "已参与轮播" : "仅编辑歌单"}</Badge>
                    <Badge variant="outline">{currentUserSong?.userId === user?.id ? "轮到你" : "等待轮到"}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
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
                </CardContent>
              </Card>
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
