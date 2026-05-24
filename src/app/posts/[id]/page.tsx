"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; username: string; avatar: string | null };
}

interface Post {
  id: string;
  title: string;
  content: string;
  images: string[];
  createdAt: string;
  userId: string;
  user: { id: string; username: string; avatar: string | null };
  comments: Comment[];
}

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchPost = async () => {
    const res = await fetch(`/api/posts/${id}`);
    const data = await res.json();
    if (data.post) setPost(data.post);
    setLoading(false);
  };

  useEffect(() => {
    fetchPost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleComment = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    const res = await fetch(`/api/posts/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: commentText.trim() }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (data.comment) {
      setCommentText("");
      await fetchPost();
    } else {
      toast.error(data.error || "评论失败");
    }
  };

  const handleDeleteComment = async (cid: string) => {
    const res = await fetch(`/api/posts/${id}/comments/${cid}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("已删除");
      await fetchPost();
    }
  };

  const handleDeletePost = async () => {
    if (!confirm("确定删除这篇帖子？")) return;
    setDeleting(true);
    const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      toast.success("已删除");
      router.push("/posts");
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <p className="text-4xl">🔍</p>
        <p className="mt-2">帖子不存在</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      {/* Post Header */}
      <div>
        <h1 className="text-2xl font-bold">{post.title}</h1>
        <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Avatar className="h-5 w-5">
              <AvatarImage src={post.user.avatar || ""} />
              <AvatarFallback className="text-[10px]">
                {post.user.username.slice(0, 1)}
              </AvatarFallback>
            </Avatar>
            {post.user.username}
          </div>
          <span>{new Date(post.createdAt).toLocaleString("zh-CN")}</span>
          {user?.id === post.userId && (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/posts/${id}/edit`)}
              >
                编辑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeletePost}
                disabled={deleting}
                className="text-destructive"
              >
                {deleting ? "删除中..." : "删除"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Images */}
      {post.images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {post.images.map((url, i) => (
            <img
              key={i}
              src={url}
              alt=""
              className="max-h-64 rounded-md object-cover"
            />
          ))}
        </div>
      )}

      {/* Content */}
      <Card className="prose prose-sm dark:prose-invert max-w-none p-6">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
      </Card>

      {/* Comments */}
      <div>
        <h3 className="mb-4 text-lg font-semibold">
          评论（{post.comments.length}）
        </h3>

        <div className="space-y-3">
          {post.comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={comment.user.avatar || ""} />
                <AvatarFallback className="text-xs">
                  {comment.user.username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {comment.user.username}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(comment.createdAt).toLocaleString("zh-CN")}
                  </span>
                  {user?.id === comment.user.id && (
                    <button
                      onClick={() => handleDeleteComment(comment.id)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      删除
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-sm">{comment.content}</p>
              </div>
            </div>
          ))}
        </div>

        {post.comments.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            暂无评论，来说两句吧
          </p>
        )}

        {/* Comment Input */}
        {user ? (
          <div className="mt-4 flex gap-3">
            <Textarea
              placeholder="写下你的评论..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              rows={2}
              className="resize-none"
            />
            <Button
              onClick={handleComment}
              disabled={submitting || !commentText.trim()}
              className="shrink-0 self-end"
            >
              {submitting ? "..." : "发送"}
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            请先
            <a href="/login" className="text-primary hover:underline">
              登录
            </a>
            后评论
          </p>
        )}
      </div>
    </div>
  );
}
