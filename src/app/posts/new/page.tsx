"use client";

import { apiUrl } from "@/lib/url";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export default function NewPostPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("只支持图片格式");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("图片不能超过 5MB");
      return;
    }
    if (images.length >= 9) {
      toast.error("最多上传 9 张图片");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch(apiUrl("/api/upload"), { method: "POST", body: formData });
    const data = await res.json();
    setUploading(false);

    if (data.url) {
      setImages((prev) => [...prev, data.url]);
    } else {
      toast.error(data.error || "上传失败");
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePublish = async () => {
    if (!title.trim()) return toast.error("请输入标题");
    if (!content.trim()) return toast.error("请输入内容");

    setPublishing(true);
    const res = await fetch(apiUrl("/api/posts"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), content: content.trim(), images }),
    });
    const data = await res.json();
    setPublishing(false);

    if (data.post) {
      toast.success("发布成功");
      router.push(`/posts/${data.post.id}`);
    } else {
      toast.error(data.error || "发布失败");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <h1 className="text-2xl font-bold">写帖子</h1>

      <Input
        placeholder="标题（最多 100 字）"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={100}
      />

      {/* Formatting toolbar */}
      <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1.5">
        {[
          { label: "H1", insert: "# " },
          { label: "H2", insert: "## " },
          { label: "H3", insert: "### " },
          { label: "**B**", insert: "**粗体**" },
          { label: "*I*", insert: "*斜体*" },
          { label: "~~S~~", insert: "~~删除~~" },
          { label: "`code`", insert: "`代码`" },
          { label: "```", insert: "\n```\n代码块\n```\n" },
          { label: "- List", insert: "- " },
          { label: "1. List", insert: "1. " },
          { label: "> Quote", insert: "> " },
          { label: "[Link]", insert: "[链接文字](url)" },
          { label: "---", insert: "\n---\n" },
        ].map((btn) => (
          <button
            key={btn.label}
            type="button"
            onClick={() => setContent((prev) => prev + btn.insert)}
            className="rounded px-2 py-1 text-xs hover:bg-accent"
            title={btn.label}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Side-by-side editor + preview */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">编辑</div>
          <Textarea
            placeholder="支持 Markdown 格式…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={16}
            className="resize-y font-mono text-sm min-h-[300px]"
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">预览</div>
          <Card className="prose prose-sm dark:prose-invert max-w-none min-h-[300px] overflow-auto rounded-md border p-3">
            {content.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            ) : (
              <p className="text-muted-foreground">暂无内容</p>
            )}
          </Card>
        </div>
      </div>

      {/* Image upload */}
      <div>
        <p className="mb-2 text-sm text-muted-foreground">
          图片（{images.length}/9）
        </p>
        <div className="flex flex-wrap gap-2">
          {images.map((url, i) => (
            <div key={i} className="relative">
              <img src={url} alt="" className="h-20 w-20 rounded-md object-cover" />
              <button
                onClick={() => removeImage(i)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-white"
              >
                x
              </button>
            </div>
          ))}
          {images.length < 9 && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex h-20 w-20 items-center justify-center rounded-md border-2 border-dashed text-2xl text-muted-foreground hover:border-primary hover:text-primary"
              >
                {uploading ? "..." : "+"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={handlePublish} disabled={publishing}>
          {publishing ? "发布中..." : "发布"}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>
          取消
        </Button>
      </div>
    </div>
  );
}
