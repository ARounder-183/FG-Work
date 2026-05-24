"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MainPlayer } from "@/components/music/main-player";
import { RightPanels } from "@/components/music/right-panels";
import { ChatPanel } from "@/components/music/chat-panel";
import { toast } from "sonner";

interface Song {
  id: number; name: string; artists: string; album: string; duration: number; picUrl?: string;
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
  const [serverPosition, setServerPosition] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchMySongs = useCallback(async () => {
    if (!user) return;
    try { const r = await fetch("/api/music/queue"); setMySongs((await r.json()).songs || []); } catch {}
  }, [user]);

  const fetchState = useCallback(async () => {
    const r = await fetch("/api/music/state");
    const d = await r.json();
    if (d.state) {
      setCurrentSong(d.state.currentSong);
      setIsPlaying(d.state.isPlaying || false);
      setActiveUsers(d.users || []);
      setSkipVotes(d.skipVotes || []);
      setSkipThreshold(d.skipThreshold || 1);
      setCurrentUserSong(d.currentUserSong || null);
      setServerPosition(d.state?.position || 0);
    }
    setJoined(user ? d.state?.queueOrder?.includes(user.id) : false);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchState(); fetchMySongs(); }, [fetchState, fetchMySongs]);
  useEffect(() => { const i = setInterval(() => { fetchState(); fetchMySongs(); }, 2000); return () => clearInterval(i); }, [fetchState, fetchMySongs]);
  useEffect(() => {
    const onEnd = async () => {
      await fetch("/api/music/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nextSong: true }) });
      fetchState(); fetchMySongs();
    };
    window.addEventListener("music-ended", onEnd);
    return () => window.removeEventListener("music-ended", onEnd);
  }, [fetchState, fetchMySongs]);

  const api = {
    join: async () => { await fetch("/api/music/join", { method: "POST" }); setJoined(true); fetchState(); toast.success("已加入"); },
    leave: async () => { await fetch("/api/music/leave", { method: "POST" }); setJoined(false); setCurrentSong(null); setIsPlaying(false); fetchState(); },
    skipVote: async () => { const r = await fetch("/api/music/skip", { method: "POST" }); const d = await r.json(); toast(d.skipped ? "已跳过" : `投票 (${d.voteCount}/${d.threshold})`); fetchState(); fetchMySongs(); },
    addSong: async (s: Song) => { const r = await fetch("/api/music/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ song: s }) }); if (r.ok) { toast.success("已添加"); fetchMySongs(); fetchState(); } },
    addSongs: async (songs: Song[]) => { await fetch("/api/music/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ songs }) }); toast.success(`已添加 ${songs.length} 首`); fetchMySongs(); fetchState(); },
    reorder: async (s: { id: string; sortOrder: number }[]) => { await fetch("/api/music/queue", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ songs: s }) }); fetchMySongs(); },
    clear: async () => { await fetch("/api/music/queue?all=true", { method: "DELETE" }); fetchMySongs(); toast.success("已清空"); },
    randomize: async () => { const arr = [...mySongs].map((_, i) => ({ id: mySongs[i].id, sortOrder: i })).sort(() => Math.random() - 0.5); await api.reorder(arr.map((x, i) => ({ id: x.id, sortOrder: i }))); toast.success("已随机"); },
    reportPosition: async (pos: number) => {
      await fetch("/api/music/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ position: pos }) });
    },
  };

  if (loading) return <div className="mx-auto max-w-5xl px-4 py-8"><Skeleton className="h-96 w-full" /></div>;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Left: Player + Chat */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-center gap-3 border-b px-4 py-2">
          <span className="text-xs text-muted-foreground">{activeUsers.length} 人在线</span>
          {!joined
            ? <Button size="sm" onClick={api.join} disabled={!user}>{user ? "加入" : "请登录"}</Button>
            : <Button size="sm" variant="outline" onClick={api.leave}>离开</Button>}
        </div>
        <div className="flex flex-1 items-center justify-center px-4">
          <MainPlayer
            currentSong={currentSong}
            isPlaying={isPlaying}
            isCurrentUserSong={currentUserSong?.userId === user?.id}
            serverPosition={serverPosition}
            onSkipVote={api.skipVote}
            skipVotes={skipVotes.length}
            skipThreshold={skipThreshold}
            activeUsers={activeUsers}
            currentUserId={currentUserSong?.userId || null}
            songSubmittedBy={currentUserSong ? { username: currentUserSong.user.username, avatar: currentUserSong.user.avatar } : undefined}
            onReportPosition={api.reportPosition}
          />
        </div>
        <div className="mx-4 mb-4 max-w-md">
          <ChatPanel />
        </div>
      </div>

      {/* Right: My Playlist + Search (normal flow, no fixed) */}
      <RightPanels
        mySongs={mySongs}
        currentSong={currentSong}
        onReorder={api.reorder}
        onClear={api.clear}
        onRandomize={api.randomize}
        onAddSong={api.addSong}
        onAddSongs={api.addSongs}
      />
    </div>
  );
}
