"use client";

import { apiUrl } from "@/lib/url";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
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
  const [serverPosition, setServerPosition] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [phoneLoginOpen, setPhoneLoginOpen] = useState(false);
  const [biliLoggedIn, setBiliLoggedIn] = useState(false);
  const [biliUname, setBiliUname] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

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

  if (loading) {
    return (
      <div className="flex-1">
        <Skeleton className="h-[calc(100vh-3.5rem)] w-full bg-foreground/10" />
      </div>
    );
  }

  return (
    <>
      <div className="relative flex-1 overflow-hidden">
        <div className="flex h-[calc(100vh-3.5rem)] w-full flex-col">
          <MainPlayer
            joined={joined}
            canJoin={Boolean(user)}
            mySongCount={mySongs.length}
            currentSong={joined ? currentSong : null}
            isPlaying={joined ? isPlaying : false}
            isCurrentUserSong={currentUserSong?.userId === user?.id}
            serverPosition={serverPosition}
            onJoinRoom={api.join}
            onLeaveRoom={api.leave}
            onSkipVote={api.skipVote}
            onForceSkip={api.forceSkip}
            skipVotes={skipVotes.length}
            skipThreshold={skipThreshold}
            activeUsers={activeUsers}
            currentUserId={currentUserSong?.userId || null}
            songSubmittedBy={currentUserSong ? { username: currentUserSong.user.username, avatar: currentUserSong.user.avatar } : undefined}
          />
        </div>

        <div
          className={`fixed inset-0 z-40 bg-slate-950/28 transition-opacity duration-500 ease-out ${libraryOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
          onClick={() => {
            setLibraryOpen(false);
            setSearchOpen(false);
          }}
        />

        <button
          type="button"
          aria-label={libraryOpen ? "收起歌单" : "展开歌单"}
          className={`fixed right-0 top-1/2 z-50 flex h-28 w-11 -translate-y-1/2 items-center justify-center rounded-l-2xl border border-r-0 border-border backdrop-blur transition-colors ${libraryOpen ? "bg-accent text-accent-foreground" : "bg-background/85 text-foreground hover:bg-background"}`}
          onClick={() => setLibraryOpen((prev) => !prev)}
        >
          <span className="[writing-mode:vertical-rl] text-xs font-medium tracking-[0.28em]">
            {libraryOpen ? "收起歌单" : "歌单"}
          </span>
        </button>

        <aside
          className={`fixed right-0 top-14 z-50 h-[calc(100vh-3.5rem)] transition-[transform,width,opacity] duration-500 ease-[cubic-bezier(0.32,0.72,0.21,1)] ${searchOpen ? "w-[min(44rem,90vw)] lg:w-[min(48rem,52vw)]" : "w-[min(22rem,88vw)] lg:w-[min(24rem,26vw)]"} ${libraryOpen ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-full opacity-0"}`}
        >
          <div className="flex h-full flex-col overflow-hidden border border-r-0 border-border bg-background shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 sm:px-5">
              <div className="text-base font-semibold">歌单</div>
              <Button variant="ghost" size="sm" onClick={() => { setLibraryOpen(false); setSearchOpen(false); }}>
                关闭
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
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
                searchOpen={searchOpen}
                onToggleSearch={() => setSearchOpen((prev) => !prev)}
              />
            </div>
          </div>
        </aside>

        <Button
          className="fixed bottom-3 left-3 z-50 rounded-full border border-border bg-background/85 px-4 text-foreground shadow-lg backdrop-blur hover:bg-background"
          variant="ghost"
          onClick={() => setChatOpen((prev) => !prev)}
        >
          {chatOpen ? "收起消息" : "房间消息"}
        </Button>

        <div
          className={`fixed bottom-16 left-3 z-40 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl border border-border bg-background shadow-2xl backdrop-blur transition-all duration-300 sm:w-[22rem] ${chatOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-5 opacity-0"}`}
        >
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 sm:px-5">
            <div className="text-base font-semibold">房间消息</div>
            <Button variant="ghost" size="sm" onClick={() => setChatOpen(false)}>
              关闭
            </Button>
          </div>
          <ChatPanel />
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
