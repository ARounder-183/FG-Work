"use client";

import { apiUrl } from "@/lib/url";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  const upcomingSongs = nextSongs.slice(0, 5).map(({ item, song, isCurrent }) => ({
    id: item.id,
    name: song?.name || "解析失败的歌曲",
    artists: song?.artists || "未知作者",
    userName: item.user.username,
    duration: song ? formatDuration(song.duration) : "--:--",
    isCurrent,
  }));

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 lg:px-6">
        <Skeleton className="h-[28rem] w-full rounded-[28px]" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,1fr)]">
          <Skeleton className="h-[24rem] w-full rounded-[24px]" />
          <Skeleton className="h-[32rem] w-full rounded-[24px]" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 bg-muted/20">
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 lg:px-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,1fr)] xl:items-start">
            <section className="space-y-6">
              <div className="overflow-hidden rounded-[28px]">
                <div className="flex flex-wrap items-center justify-end gap-2 px-1 pb-3">
                      <Badge variant={joined ? "default" : "outline"}>{joined ? "已加入" : "未加入"}</Badge>
                      <Badge variant="outline">{activeUsers.length} 人</Badge>
                      <Badge variant="outline">{mySongs.length} 首</Badge>
                      {currentSong ? <Badge variant="secondary">{isPlaying ? "播放中" : "暂停中"}</Badge> : null}
                    </div>
                <div>
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
                    upcomingSongs={upcomingSongs}
                  />
                </div>
              </div>

              <Card className="overflow-hidden rounded-[24px] border border-border/60 bg-background shadow-sm">
                <CardHeader className="border-b border-border/60 pb-4">
                  <CardTitle className="text-lg">房间消息</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ChatPanel />
                </CardContent>
              </Card>
            </section>

            <aside id="music-library" className="min-h-0 xl:sticky xl:top-20 xl:self-start">
              <Card className="flex h-full overflow-hidden rounded-[28px] border border-border/60 bg-background shadow-sm xl:h-[calc(100vh-7.5rem)]">
                <CardHeader className="border-b border-border/60 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-xl">歌单</CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={joined ? "default" : "outline"}>{joined ? "已参与轮播" : "仅编辑歌单"}</Badge>
                      <Badge variant="outline">{currentUserSong?.userId === user?.id ? "轮到你" : "等待轮到"}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="min-h-0 flex-1 p-0">
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
