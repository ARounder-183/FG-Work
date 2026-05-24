"use client";

import { apiUrl } from "@/lib/url";
import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/auth-provider";
import { useStudy } from "@/components/study-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface Topic {
  id: string;
  name: string;
  icon: string | null;
}

interface ActiveCheckIn {
  id: string;
  startedAt: string;
  topic: Topic;
}

interface TodayRecord {
  topic: Topic;
  duration: number;
}

export default function StudyPage() {
  const { user } = useAuth();
  const { refreshStudy } = useStudy();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [active, setActive] = useState<ActiveCheckIn | null>(null);
  const [todayRecords, setTodayRecords] = useState<TodayRecord[]>([]);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [startingTopic, setStartingTopic] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [newIcon, setNewIcon] = useState("📌");
  const [creating, setCreating] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchTopics = async () => {
    const res = await fetch(apiUrl("/api/topics"));
    const data = await res.json();
    setTopics(data.topics);
  };

  const fetchState = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      const [activeRes, todayRes] = await Promise.all([
        fetch(apiUrl("/api/checkin/active")),
        fetch(apiUrl("/api/checkin/today")),
      ]);
      if (activeRes.ok) {
        const activeData = await activeRes.json();
        setActive(activeData.active);
      }
      if (todayRes.ok) {
        const todayData = await todayRes.json();
        setTodayRecords(todayData.records || []);
        setTotalSeconds(todayData.totalSeconds || 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchTopics();
    fetchState();
  }, [fetchState]);

  useEffect(() => {
    if (active) {
      setElapsed(Math.round((Date.now() - new Date(active.startedAt).getTime()) / 1000));
      timerRef.current = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    } else {
      setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [active]);

  // Auto-stop on tab close / disconnect
  useEffect(() => {
    const stopIfActive = () => {
      if (active) {
        navigator.sendBeacon(apiUrl("/api/checkin/stop"));
      }
    };
    window.addEventListener("beforeunload", stopIfActive);
    window.addEventListener("visibilitychange", () => {
      // If hidden for > 30min, stop on next visibility
      if (document.hidden && active) {
        const timeout = setTimeout(async () => {
          await fetch(apiUrl("/api/checkin/stop"), { method: "POST" });
          window.location.reload();
        }, 30 * 60 * 1000);
        const onVisible = () => { clearTimeout(timeout); document.removeEventListener("visibilitychange", onVisible); };
        document.addEventListener("visibilitychange", onVisible, { once: true });
      }
    });
    return () => {
      window.removeEventListener("beforeunload", stopIfActive);
    };
  }, [active]);

  // Stop stale checkins (older than 12h) on page load
  useEffect(() => {
    if (!active) return;
    const hoursRunning = (Date.now() - new Date(active.startedAt).getTime()) / 3600000;
    if (hoursRunning > 12) {
      fetch(apiUrl("/api/checkin/stop"), { method: "POST" }).then(() => {
        setActive(null);
        toast("检测到异常计时，已自动停止");
      });
    }
  }, [active?.id]);

  const handleStart = async (topicId: string) => {
    setStartingTopic(topicId);
    const res = await fetch(apiUrl("/api/checkin/start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId }),
    });
    const data = await res.json();
    setStartingTopic(null);
    if (data.checkIn) {
      setActive(data.checkIn);
      refreshStudy();
      toast.success("开始自习");
    } else {
      toast.error(data.error || "开始失败");
    }
  };

  const handleStop = async () => {
    setStopping(true);
    const res = await fetch(apiUrl("/api/checkin/stop"), { method: "POST" });
    const data = await res.json();
    setStopping(false);
    if (data.checkIn) {
      toast.success(`本次自习 ${formatHMS(data.duration || 0)}`);
      setActive(null);
      setElapsed(0);
      refreshStudy();
      fetchState();
    } else {
      toast.error(data.error || "结束失败");
    }
  };

  const handleCreateTopic = async () => {
    if (!newTopic.trim()) return;
    setCreating(true);
    const res = await fetch(apiUrl("/api/topics"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTopic.trim(), icon: newIcon }),
    });
    setCreating(false);
    const data = await res.json();
    if (data.topic) {
      setNewTopic("");
      fetchTopics();
      toast.success("主题已创建");
    } else {
      toast.error(data.error || "创建失败");
    }
  };

  const { h, m, s } = (() => {
    const hh = Math.floor(elapsed / 3600);
    const mm = Math.floor((elapsed % 3600) / 60);
    const ss = elapsed % 60;
    return { h: hh, m: mm, s: ss };
  })();

  const formatHMS = (sec: number) => {
    const hh = Math.floor(sec / 3600);
    const mm = Math.floor((sec % 3600) / 60);
    const ss = sec % 60;
    if (hh > 0) return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    return `${mm}:${String(ss).padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-8">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!user) {
    return <div className="py-20 text-center"><p className="text-muted-foreground">请先登录后使用自习功能</p></div>;
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-8">
      {active ? (
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">
              正在自习 · {active.topic.icon} {active.topic.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="font-mono text-5xl font-bold tracking-wider tabular-nums">
              {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
            </div>
            <p className="text-sm text-muted-foreground">
              开始于 {new Date(active.startedAt).toLocaleTimeString("zh-CN")}
            </p>
            <Button size="lg" variant="destructive" onClick={handleStop} disabled={stopping} className="px-10">
              {stopping ? "结束中..." : "结束自习"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="text-center">
          <CardHeader>
            <CardTitle>选择一个主题开始自习</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap justify-center gap-3">
              {topics.map((topic) => (
                <Button
                  key={topic.id}
                  variant="outline"
                  size="lg"
                  className="flex-col gap-1 px-4 py-3 min-h-[72px]"
                  onClick={() => handleStart(topic.id)}
                  disabled={startingTopic === topic.id}
                >
                  <span className="text-2xl leading-none">{topic.icon || "📌"}</span>
                  <span>{topic.name}</span>
                </Button>
              ))}
            </div>
            {topics.length === 0 && (
              <p className="text-sm text-muted-foreground">还没有主题，创建一个吧</p>
            )}

            {/* Create topic */}
            <div className="flex items-center gap-2 border-t pt-3">
              <Input
                placeholder="图标 emoji"
                value={newIcon}
                onChange={(e) => setNewIcon(e.target.value)}
                className="w-20 text-center"
                maxLength={2}
              />
              <Input
                placeholder="新主题名称"
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateTopic()}
              />
              <Button size="sm" onClick={handleCreateTopic} disabled={creating || !newTopic.trim()}>
                {creating ? "..." : "创建"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">今日统计 · {formatHMS(totalSeconds)}</CardTitle>
        </CardHeader>
        <CardContent>
          {todayRecords.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">今天还没有学习记录</p>
          ) : (
            <div className="space-y-2">
              {todayRecords.map((record) => {
                const sec = record.duration;
                const maxSec = Math.max(...todayRecords.map((r) => r.duration), 1);
                const barWidth = Math.max((sec / maxSec) * 100, 2);
                return (
                  <div key={record.topic.id} className="flex items-center gap-3">
                    <span className="w-8 text-center text-lg">{record.topic.icon}</span>
                    <span className="w-20 text-sm">{record.topic.name}</span>
                    <div className="flex-1">
                      <div className="h-5 rounded-sm bg-primary/20" style={{ width: `${barWidth}%` }} />
                    </div>
                    <span className="w-20 text-right text-sm tabular-nums">{formatHMS(sec)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
