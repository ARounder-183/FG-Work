"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-12">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      {/* Hero */}
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">
            {user ? `欢迎回来，${user.username}` : "欢迎来到FG自习室"}
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          在线自习、发帖交流、一起听歌
        </p>
        {!user && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href="/login">
              <Button size="lg">登录</Button>
            </Link>
            <Link href="/register">
              <Button variant="outline" size="lg">
                注册
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/study">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="text-3xl">⏱️</div>
              <CardTitle className="mt-2">自习打卡</CardTitle>
              <CardDescription>
                选择主题，开始计时，专注学习
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/posts">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="text-3xl">📝</div>
              <CardTitle className="mt-2">帖子广场</CardTitle>
              <CardDescription>
                分享学习心得，交流讨论
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/music">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="text-3xl">🎵</div>
              <CardTitle className="mt-2">一起听歌</CardTitle>
              <CardDescription>
                搜索歌曲，同步播放
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
