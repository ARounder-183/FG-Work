"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (!user) { router.push("/login"); return; }
      if (user.role !== "admin") { router.push("/"); return; }
    }
  }, [user, loading, router]);

  if (loading || !user || user.role !== "admin") return null;

  const tabs = [
    { label: "总览", href: "/admin" },
    { label: "用户", href: "/admin?tab=users" },
    { label: "帖子", href: "/admin?tab=posts" },
    { label: "聊天", href: "/admin?tab=chat" },
    { label: "音乐", href: "/admin?tab=music" },
  ];

  const currentTab = new URLSearchParams(pathname.includes("?") ? pathname.split("?")[1] : "").get("tab") || "";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-4 text-xl font-bold">管理后台</h1>
      <div className="mb-4 flex gap-1 border-b pb-2">
        {tabs.map((t) => {
          const isActive = t.href === "/admin" ? !currentTab : t.href.includes(`tab=${currentTab}`);
          return (
            <Button
              key={t.label}
              variant={isActive ? "default" : "ghost"}
              size="sm"
              onClick={() => router.push(t.href)}
            >
              {t.label}
            </Button>
          );
        })}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
