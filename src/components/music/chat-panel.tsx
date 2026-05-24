"use client";

import { apiUrl } from "@/lib/url";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface ChatMsg {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; username: string; avatar: string | null };
}

export function ChatPanel() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    const res = await fetch(apiUrl("/api/chat"));
    const data = await res.json();
    setMessages(data.messages || []);
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 2000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll chat to bottom (contained within the chat panel only)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    const res = await fetch(apiUrl("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: input.trim() }),
    });
    setSending(false);
    if (res.ok) {
      setInput("");
      fetchMessages();
    }
  };

  return (
    <div className="flex h-64 flex-col rounded-lg border bg-card">
      {/* Header */}
      <div className="border-b px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">聊天</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2">
        {messages.map((msg) => (
          <div key={msg.id} className="flex items-start gap-1.5 py-0.5 text-sm">
            <Avatar className="h-5 w-5 shrink-0">
              <AvatarImage src={msg.user.avatar || ""} />
              <AvatarFallback className="text-[8px]">
                {msg.user.username.slice(0, 1)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <span className="font-medium text-primary">{msg.user.username}</span>
              <span className="text-muted-foreground">: </span>
              <span className="break-all">{msg.content}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      {user ? (
        <div className="flex gap-1 border-t p-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="输入消息..."
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={handleSend} disabled={sending || !input.trim()}>
            {sending ? "..." : "发送"}
          </Button>
        </div>
      ) : (
        <p className="border-t p-2 text-center text-xs text-muted-foreground">
          请登录后参与聊天
        </p>
      )}
    </div>
  );
}
