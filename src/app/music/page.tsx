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
  id: number | string; name: string; artists: string; album: string; duration: number; picUrl?: string;
  source?: "ncm" | "bilibili"; bvid?: string; cid?: number;
}
interface MySong { id: string; songData: string; sortOrder: number; }
interface ActiveUser { id: string; username: string; avatar: string | null; }
interface CurrentUserSong { id: string; userId: string; user: { username: string; avatar: string | null }; }

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
  const [fullQueue, setFullQueue] = useState<Array<{id:string;songData:string;userId:string;user:{username:string;avatar:string|null}}>>([]);
  const [serverPosition, setServerPosition] = useState(0);
  const [loading, setLoading] = useState(true);
  const [queueOpen, setQueueOpen] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [phoneLoginOpen, setPhoneLoginOpen] = useState(false);
  const [biliLoggedIn, setBiliLoggedIn] = useState(false);
  const [biliUname, setBiliUname] = useState("");

  const fetchMySongs = useCallback(async () => {
    if (!user) return;
    try { const r = await fetch(apiUrl("/api/music/queue")); if (r.ok) setMySongs((await r.json()).songs || []); } catch {}
  }, [user]);

  const fetchState = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/api/music/state"));
      if (!r.ok) return;
      const d = await r.json();
      if (d.state) {
        setCurrentSong(d.state.currentSong);
        setIsPlaying(d.state.isPlaying || false);
        setActiveUsers(d.users || []);
        setSkipVotes(d.skipVotes || []);
        setSkipThreshold(d.skipThreshold || 1);
        setCurrentUserSong(d.currentUserSong || null);
        setFullQueue(d.fullQueue || []);
        setServerPosition(d.state?.position || 0);
      }
      setJoined(user ? d.state?.queueOrder?.includes(user.id) : false);
    } catch {
      // Silently retry on next poll
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchState(); fetchMySongs(); }, [fetchState, fetchMySongs]);
  useEffect(() => {
    const stateInterval = window.setInterval(() => {
      if (!document.hidden) {
        void fetchState();
      }
    }, 3000);
    const queueInterval = window.setInterval(() => {
      if (!document.hidden && user) {
        void fetchMySongs();
      }
    }, 12000);

    return () => {
      window.clearInterval(stateInterval);
      window.clearInterval(queueInterval);
    };
  }, [fetchMySongs, fetchState, user]);

  // Check Bilibili login status
  useEffect(() => {
    fetch(apiUrl("/api/bilibili/login/status"))
      .then((r) => r.json())
      .then((d) => {
        setBiliLoggedIn(d.loggedIn || false);
        setBiliUname(d.bilibiliUname || "");
      })
      .catch(() => {});
  }, []);

  // Leave room only on actual page close / refresh (not tab switch or SPA navigation).
  // Background listening is expected — server timeout handles inactive users.
  useEffect(() => {
    const leave = () => {
      if (joined) navigator.sendBeacon(apiUrl("/api/music/leave"));
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [joined]);

  const api = {
    join: async () => { await fetch(apiUrl("/api/music/join"), { method: "POST" }); setJoined(true); void fetchState(); void fetchMySongs(); toast.success("已加入"); },
    leave: async () => { await fetch(apiUrl("/api/music/leave"), { method: "POST" }); setJoined(false); setCurrentSong(null); setIsPlaying(false); void fetchState(); },
    skipVote: async () => { const r = await fetch(apiUrl("/api/music/skip"), { method: "POST" }); const d = await r.json(); toast(d.skipped ? "已跳过" : `投票 (${d.voteCount}/${d.threshold})`); void fetchState(); void fetchMySongs(); },
    forceSkip: async () => { const r = await fetch(apiUrl("/api/music/skip?force=true"), { method: "POST" }); const d = await r.json(); if (d.skipped) { toast.success("已跳过"); void fetchState(); void fetchMySongs(); } else toast.error(d.error); },
    addSong: async (s: Song) => { const r = await fetch(apiUrl("/api/music/queue"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ song: s }) }); if (r.ok) { toast.success("已添加"); void fetchMySongs(); void fetchState(); } },
    addSongs: async (songs: Song[]) => { await fetch(apiUrl("/api/music/queue"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ songs }) }); toast.success(`已添加 ${songs.length} 首`); void fetchMySongs(); void fetchState(); },
    reorder: async (s: { id: string; sortOrder: number }[]) => { await fetch(apiUrl("/api/music/queue"), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ songs: s }) }); void fetchMySongs(); },
    clear: async () => { await fetch(apiUrl("/api/music/queue?all=true"), { method: "DELETE" }); void fetchMySongs(); toast.success("已清空"); },
    randomize: async () => { const arr = [...mySongs].map((_, i) => ({ id: mySongs[i].id, sortOrder: i })).sort(() => Math.random() - 0.5); await api.reorder(arr.map((x, i) => ({ id: x.id, sortOrder: i }))); toast.success("已随机"); },
    deleteSong: async (id: string) => { await fetch(apiUrl(`/api/music/queue?id=${id}`), { method: "DELETE" }); void fetchMySongs(); toast.success("已删除"); },
  };

  if (loading) return <div className="mx-auto max-w-5xl px-4 py-8"><Skeleton className="h-96 w-full" /></div>;

  return (
    <>
    <div className="flex min-h-0 flex-1">
      <div className="flex flex-1 flex-col min-h-0">
        <div className="flex items-center justify-center gap-3 border-b px-4 py-2">
          <span className="text-xs text-muted-foreground">{activeUsers.length} 人在线</span>
          {!joined
            ? <Button size="sm" onClick={api.join} disabled={!user}>{user ? "加入" : "请登录"}</Button>
            : <Button size="sm" variant="outline" onClick={api.leave}>离开</Button>}
        </div>
        <div className="flex flex-1 items-center justify-center px-4 min-h-0 overflow-y-auto">
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
        </div>

        {/* Bottom row: Chat + Global queue side by side */}
        <div className="mx-4 mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChatPanel />
          <div>
            <button onClick={() => setQueueOpen(!queueOpen)} className="flex w-full items-center justify-between rounded-lg border bg-card p-2 text-xs font-medium hover:bg-accent">
              下一首 ({fullQueue.length} 首)
              <span className="text-muted-foreground">{queueOpen ? "收起" : "展开"}</span>
            </button>
            {queueOpen && (
              <div className="max-h-48 overflow-y-auto divide-y rounded-b-lg border border-t-0 bg-card">
              {(() => {
                // Group by user, show only first song per user
                const seen = new Set<string>();
                const nextSongs = fullQueue.filter((item) => {
                  if (seen.has(item.userId)) return false;
                  seen.add(item.userId);
                  return true;
                });
                if (nextSongs.length === 0) return <p className="p-3 text-center text-xs text-muted-foreground">队列为空</p>;
                return nextSongs.map((item, i) => {
                  const s = JSON.parse(item.songData) as Song;
                  const isCur = currentSong && s.id === currentSong.id;
                  return (
                    <div key={item.id} className={`flex items-center gap-2 px-3 py-1.5 text-xs ${isCur ? "bg-primary/10" : ""}`}>
                      <span className="w-5 text-center tabular-nums text-muted-foreground">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className={`truncate ${isCur ? "font-medium text-primary" : ""}`}>{s.name}</div>
                        <div className="truncate text-muted-foreground/70">{s.artists}</div>
                      </div>
                      <span className="shrink-0 text-muted-foreground">{item.user.username}</span>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Right: My Playlist + Search (normal flow, no fixed) */}
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
            toast.success("已退出B站登录");
          } catch { toast.error("退出失败"); }
        }}
      />
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
