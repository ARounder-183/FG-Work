"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useStudy } from "@/components/study-provider";
import { useMusic } from "@/components/music-provider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV_LINKS = [
  { href: "/", label: "首页" },
  { href: "/posts", label: "帖子" },
  { href: "/study", label: "自习" },
  { href: "/music", label: "听歌" },
  { href: "/leaderboard", label: "排行榜" },
  { href: "/stats", label: "统计" },
];

export function Navbar() {
  const { user, loading, logout } = useAuth();
  const { active } = useStudy();
  const { currentSong, isPlaying } = useMusic();
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (active) {
      setElapsed(Math.round((Date.now() - new Date(active.startedAt).getTime()) / 1000));
      const interval = setInterval(() => setElapsed((prev) => prev + 1), 1000);
      return () => clearInterval(interval);
    } else {
      setElapsed(0);
    }
  }, [active]);

  const formatTimer = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  // Don't show loading state for navbar (avoids flash)
  if (loading) return null;

  return (
    <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            FG自习室
          </Link>
          <div className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Timer */}
        <div className="flex items-center gap-2">
          {active && (
            <Link href="/study" className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-mono tabular-nums text-primary animate-pulse">
              <span>{active.topicIcon}</span>
              <span>{formatTimer(elapsed)}</span>
            </Link>
          )}
          {currentSong && (
            <Link href="/music" className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-1 text-xs text-green-600 max-w-[160px]">
              <span>{isPlaying ? "🎵" : "⏸️"}</span>
              <span className="truncate">{currentSong.name}</span>
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={user.avatar || ""} alt={user.username} />
                  <AvatarFallback className="text-xs">
                    {user.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span>{user.username}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => router.push("/profile")}>
                  个人中心
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  登录
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm">注册</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
