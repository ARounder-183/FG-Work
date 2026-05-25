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
  const [ttsVolume, setTtsVolume] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("tts-volume");
      if (saved) return Number(saved);
    }
    return 0.8;
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);
  const seenIds = useRef(new Set<string>());
  const isSpeaking = useRef(false);
  const speakQueue = useRef<string[]>([]);
  const ttsVolumeRef = useRef(ttsVolume);
  ttsVolumeRef.current = ttsVolume;

  const fetchMessages = async () => {
    const res = await fetch(apiUrl("/api/chat"));
    const data = await res.json();
    const msgs: ChatMsg[] = data.messages || [];
    setMessages(msgs);

    // First load: mark all as seen, don't speak
    if (isFirstLoad.current) {
      msgs.forEach((m) => seenIds.current.add(m.id));
      isFirstLoad.current = false;
      return;
    }

    // Detect new messages
    const newMsgs = msgs.filter((m) => !seenIds.current.has(m.id));
    newMsgs.forEach((m) => seenIds.current.add(m.id));

    if (newMsgs.length > 0) {
      const texts = newMsgs.map((m) => `${m.user.username}说：${m.content}`);
      speakQueue.current.push(...texts);
      drainSpeakQueue();
    }
  };

  const drainSpeakQueue = async () => {
    if (isSpeaking.current) return;
    isSpeaking.current = true;
    try {
      while (speakQueue.current.length > 0) {
        const text = speakQueue.current.shift()!;
        await speakText(text);
      }
    } finally {
      isSpeaking.current = false;
    }
  };

  const speakText = (text: string): Promise<void> => {
    return new Promise((resolve) => {
      fetch(apiUrl("/api/chat/tts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
        .then((r) => {
          if (!r.ok) { resolve(); return null; }
          return r.blob();
        })
        .then((blob) => {
          if (!blob) { resolve(); return; }
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.volume = ttsVolumeRef.current;
          audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
          audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
          audio.play().catch(() => { URL.revokeObjectURL(url); resolve(); });
        })
        .catch(() => resolve());
    });
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (isFirstLoad.current || el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  };

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
      scrollToBottom();
    }
  };

  return (
    <div className="flex h-64 flex-col rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">聊天</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">🔊</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={ttsVolume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setTtsVolume(v);
              localStorage.setItem("tts-volume", String(v));
            }}
            className="h-1 w-12 cursor-pointer accent-primary"
          />
        </div>
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
