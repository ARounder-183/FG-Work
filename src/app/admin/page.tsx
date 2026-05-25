"use client";

import { apiUrl } from "@/lib/url";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────

interface StatData { users: number; posts: number; comments: number; chatMessages: number; activeInMusic: number; hasCurrentSong: boolean; }
interface UserData { id: string; username: string; avatar: string | null; bio: string | null; role: string; createdAt: string; }
interface PostData { id: string; title: string; userId: string; createdAt: string; user: { username: string }; _count: { comments: number }; }
interface ChatData { id: string; content: string; createdAt: string; user: { username: string }; }
interface MusicData { currentSong: { name: string; artists: string } | null; isPlaying: boolean; queueOrder: string[]; songs: Array<{ id: string; songData: string; userId: string; user: { username: string } }>; }

// ── Page ─────────────────────────────────────────────────────────────

export default function AdminPage() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") || "overview";

  return (
    <>
      {tab === "overview" && <OverviewTab />}
      {tab === "users" && <UsersTab />}
      {tab === "posts" && <PostsTab />}
      {tab === "chat" && <ChatTab />}
      {tab === "music" && <MusicTab />}
    </>
  );
}

// ── Overview ─────────────────────────────────────────────────────────

function OverviewTab() {
  const [stats, setStats] = useState<StatData | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/admin/stats")).then(r => r.json()).then(d => setStats(d.stats)).catch(() => {});
  }, []);

  if (!stats) return <p className="text-sm text-muted-foreground">加载中...</p>;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <StatCard title="用户数" value={stats.users} />
      <StatCard title="帖子数" value={stats.posts} />
      <StatCard title="评论数" value={stats.comments} />
      <StatCard title="聊天消息" value={stats.chatMessages} />
      <StatCard title="音乐室在线" value={stats.activeInMusic} />
      <StatCard title="正在播放" value={stats.hasCurrentSong ? "是" : "否"} />
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">{title}</CardTitle></CardHeader>
      <CardContent><p className="text-2xl font-bold">{value}</p></CardContent>
    </Card>
  );
}

// ── Users ────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<UserData[]>([]);

  const load = useCallback(() => {
    fetch(apiUrl("/api/admin/users")).then(r => r.json()).then(d => setUsers(d.users || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const setRole = async (id: string, role: string) => {
    const r = await fetch(apiUrl(`/api/admin/users/${id}`), {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, role }),
    });
    const d = await r.json();
    toast(d.success ? "角色已更新" : (d.error || "失败"));
    if (d.success) load();
  };

  const del = async (id: string) => {
    if (!confirm("确定删除该用户？所有关联内容将被级联删除。")) return;
    const r = await fetch(apiUrl(`/api/admin/users/${id}`), { method: "DELETE" });
    const d = await r.json();
    toast(d.success ? "已删除" : (d.error || "失败"));
    if (d.success) load();
  };

  return (
    <div className="space-y-2">
      {users.map(u => (
        <Card key={u.id}>
          <CardContent className="flex items-center justify-between py-3">
            <div>
              <span className="font-medium">{u.username}</span>
              {u.role === "admin" && <span className="ml-1 text-[10px] text-primary">管理员</span>}
              <p className="text-xs text-muted-foreground">{new Date(u.createdAt).toLocaleDateString("zh-CN")}</p>
            </div>
            <div className="flex gap-1">
              {u.role === "user"
                ? <Button size="sm" variant="outline" onClick={() => setRole(u.id, "admin")}>设为管理</Button>
                : <Button size="sm" variant="outline" onClick={() => setRole(u.id, "user")}>取消管理</Button>
              }
              <Button size="sm" variant="destructive" onClick={() => del(u.id)}>删除</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Posts ────────────────────────────────────────────────────────────

function PostsTab() {
  const [posts, setPosts] = useState<PostData[]>([]);

  const load = useCallback(() => {
    fetch(apiUrl("/api/admin/posts")).then(r => r.json()).then(d => setPosts(d.posts || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const del = async (id: string) => {
    if (!confirm("确定删除该帖子？所有评论将被级联删除。")) return;
    const r = await fetch(apiUrl(`/api/admin/posts?id=${id}`), { method: "DELETE" });
    const d = await r.json();
    toast(d.success ? "已删除" : (d.error || "失败"));
    if (d.success) load();
  };

  return (
    <div className="space-y-2">
      {posts.map(p => (
        <Card key={p.id}>
          <CardContent className="flex items-center justify-between py-3">
            <div>
              <span className="font-medium">{p.title}</span>
              <p className="text-xs text-muted-foreground">{p.user.username} · {p._count.comments} 评论 · {new Date(p.createdAt).toLocaleDateString("zh-CN")}</p>
            </div>
            <Button size="sm" variant="destructive" onClick={() => del(p.id)}>删除</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Chat ─────────────────────────────────────────────────────────────

function ChatTab() {
  const [messages, setMessages] = useState<ChatData[]>([]);

  const load = useCallback(() => {
    fetch(apiUrl("/api/admin/chat")).then(r => r.json()).then(d => setMessages(d.messages || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const del = async (id: string) => {
    const r = await fetch(apiUrl(`/api/admin/chat?id=${id}`), { method: "DELETE" });
    const d = await r.json();
    toast(d.success ? "已删除" : (d.error || "失败"));
    if (d.success) load();
  };

  const clearAll = async () => {
    if (!confirm("确定清空所有聊天消息？")) return;
    const r = await fetch(apiUrl("/api/admin/chat?all=true"), { method: "DELETE" });
    const d = await r.json();
    toast(d.success ? "已清空" : (d.error || "失败"));
    if (d.success) load();
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" variant="destructive" onClick={clearAll}>清空全部</Button>
      </div>
      {messages.map(m => (
        <Card key={m.id}>
          <CardContent className="flex items-center justify-between py-3">
            <div>
              <span className="font-medium text-primary">{m.user.username}</span>
              <span className="text-muted-foreground">: </span>
              <span>{m.content}</span>
              <p className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString("zh-CN")}</p>
            </div>
            <Button size="sm" variant="destructive" onClick={() => del(m.id)}>删除</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Music ────────────────────────────────────────────────────────────

function MusicTab() {
  const [data, setData] = useState<MusicData | null>(null);

  const load = useCallback(() => {
    fetch(apiUrl("/api/admin/music")).then(r => r.json()).then(d => setData(d)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const forceSkip = async () => {
    const r = await fetch(apiUrl("/api/admin/music"), { method: "POST" });
    const d = await r.json();
    toast(d.success ? "已切歌" : (d.error || "失败"));
    if (d.success) load();
  };

  const clearQueue = async () => {
    if (!confirm("确定清空所有歌曲队列并停止播放？")) return;
    const r = await fetch(apiUrl("/api/admin/music"), { method: "DELETE" });
    const d = await r.json();
    toast(d.success ? "已清空" : (d.error || "失败"));
    if (d.success) load();
  };

  if (!data) return <p className="text-sm text-muted-foreground">加载中...</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>当前状态</CardTitle></CardHeader>
        <CardContent>
          {data.currentSong ? (
            <p>{data.currentSong.name} — {data.currentSong.artists} {data.isPlaying ? "▶" : "⏸"}</p>
          ) : (
            <p className="text-muted-foreground">无歌曲</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">在线用户：{data.queueOrder.length} 人</p>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button size="sm" onClick={forceSkip} disabled={!data.currentSong}>强制切歌</Button>
        <Button size="sm" variant="destructive" onClick={clearQueue}>清空队列</Button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">队列 ({data.songs.length} 首)</h3>
        {data.songs.map(s => {
          const parsed = JSON.parse(s.songData) as { name: string; artists: string };
          return (
            <Card key={s.id}>
              <CardContent className="py-2 text-sm">
                <span className="font-medium">{parsed.name}</span>
                <span className="text-muted-foreground"> — {parsed.artists}</span>
                <span className="ml-2 text-xs text-muted-foreground">({s.user.username})</span>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
