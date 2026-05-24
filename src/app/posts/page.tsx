"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

interface Post {
  id: string;
  title: string;
  content: string;
  images: string;
  createdAt: string;
  user: { id: string; username: string; avatar: string | null };
  _count: { comments: number };
}

export default function PostsPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPosts = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/posts?${params}`);
    return res.json();
  }, []);

  useEffect(() => {
    fetchPosts().then((data) => {
      setPosts(data.posts);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
      setLoading(false);
    });
  }, [fetchPosts]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const data = await fetchPosts(nextCursor);
    setPosts((prev) => [...prev, ...data.posts]);
    setHasMore(data.hasMore);
    setNextCursor(data.nextCursor);
    setLoadingMore(false);
  };

  const stripMarkdown = (md: string) =>
    md.replace(/[#*`~>\[\]()!_]/g, "").replace(/\n/g, " ").slice(0, 120);

  const getFirstImage = (imagesStr: string) => {
    try {
      const imgs = JSON.parse(imagesStr);
      return imgs.length > 0 ? imgs[0] : null;
    } catch {
      return null;
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">帖子广场</h1>
        {user && (
          <Link href="/posts/new">
            <Button>写帖子</Button>
          </Link>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4 space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </Card>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <p className="mb-2 text-4xl">📝</p>
          <p>还没有帖子，来写第一篇吧</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const firstImage = getFirstImage(post.images);
            return (
              <Link key={post.id} href={`/posts/${post.id}`}>
                <Card className="cursor-pointer p-4 transition-shadow hover:shadow-md">
                  <div className="flex gap-4">
                    {firstImage && (
                      <img
                        src={firstImage}
                        alt=""
                        className="h-20 w-20 shrink-0 rounded-md object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold">{post.title}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {stripMarkdown(post.content)}
                      </p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Avatar className="h-4 w-4">
                            <AvatarImage src={post.user.avatar || ""} />
                            <AvatarFallback className="text-[10px]">
                              {post.user.username.slice(0, 1)}
                            </AvatarFallback>
                          </Avatar>
                          {post.user.username}
                        </div>
                        <span>
                          {new Date(post.createdAt).toLocaleDateString("zh-CN")}
                        </span>
                        <span>{post._count.comments} 评论</span>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
          {hasMore && (
            <div className="text-center">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "加载中..." : "加载更多"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
