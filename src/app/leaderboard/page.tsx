"use client";

import { apiUrl } from "@/lib/url";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface RankItem {
  rank: number;
  userId: string;
  username: string;
  avatar: string | null;
  totalSeconds: number;
}

interface TopicDist {
  topicName: string;
  icon: string;
  totalSeconds: number;
  percentage: number;
}

type Period = "today" | "week" | "month" | "all";

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("all");
  const [rankings, setRankings] = useState<RankItem[]>([]);
  const [topicDistribution, setTopicDistribution] = useState<TopicDist[]>([]);
  const [myRank, setMyRank] = useState<{ rank: number; totalSeconds: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(apiUrl(`/api/leaderboard?period=${period}`))
      .then((r) => r.json())
      .then((data) => {
        setRankings(data.rankings || []);
        setTopicDistribution(data.topicDistribution || []);
        setMyRank(data.myRank || null);
        setLoading(false);
      });
  }, [period]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const getMedalEmoji = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return null;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-bold">排行榜</h1>

      {/* Period tabs */}
      <div className="flex gap-2">
        {(["today", "week", "month", "all"] as const).map((p) => (
          <Button
            key={p}
            variant={period === p ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod(p)}
          >
            {p === "all" ? "全部" : p === "month" ? "本月" : p === "week" ? "本周" : "本日"}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Rankings */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>学习时长排名</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : rankings.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                还没有学习记录
              </p>
            ) : (
              <div className="space-y-1">
                {rankings.map((item) => {
                  const medal = getMedalEmoji(item.rank);
                  const isMe = item.userId === user?.id;
                  return (
                    <div
                      key={item.userId}
                      className={`flex items-center gap-3 rounded-md p-2 ${
                        isMe ? "bg-primary/10" : ""
                      }`}
                    >
                      <span className="w-8 text-center font-bold tabular-nums">
                        {medal || item.rank}
                      </span>
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={item.avatar || ""} />
                        <AvatarFallback className="text-xs">
                          {item.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex-1 text-sm font-medium">
                        {item.username}
                        {isMe && (
                          <span className="ml-1 text-xs text-primary">（我）</span>
                        )}
                      </span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {formatTime(item.totalSeconds)}
                      </span>
                    </div>
                  );
                })}

                {/* Show current user if not in top 100 */}
                {myRank && (myRank.rank > 100 || !rankings.find((r) => r.userId === user?.id)) && (
                  <div className="mt-2 rounded-md bg-primary/10 p-2">
                    <div className="flex items-center gap-3">
                      <span className="w-8 text-center tabular-nums">{myRank.rank}</span>
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={user?.avatar || ""} />
                        <AvatarFallback className="text-xs">
                          {user?.username?.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex-1 text-sm font-medium">
                        {user?.username}
                        <span className="ml-1 text-xs text-primary">（我）</span>
                      </span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {formatTime(myRank.totalSeconds)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Topic Distribution */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>主题分布</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : topicDistribution.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                暂无数据
              </p>
            ) : (
              <div className="space-y-3">
                {topicDistribution.map((item) => (
                  <div key={item.topicName}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span>
                        {item.icon} {item.topicName}
                      </span>
                      <span className="text-muted-foreground">
                        {formatTime(item.totalSeconds)} · {item.percentage}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-secondary">
                      <div
                        className="h-2 rounded-full bg-primary transition-all"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
