"use client";

import { apiUrl } from "@/lib/url";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface ChatMsg {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; username: string; avatar: string | null };
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
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

  useEffect(() => {
    ttsVolumeRef.current = ttsVolume;
  }, [ttsVolume]);

  const fetchMessages = async () => {
    const response = await fetch(apiUrl("/api/chat"));
    const data = await response.json();
    const nextMessages: ChatMsg[] = data.messages || [];
    setMessages(nextMessages);

    if (isFirstLoad.current) {
      nextMessages.forEach((message) => seenIds.current.add(message.id));
      return;
    }

    const newMessages = nextMessages.filter((message) => !seenIds.current.has(message.id));
    newMessages.forEach((message) => seenIds.current.add(message.id));

    if (newMessages.length > 0) {
      speakQueue.current.push(...newMessages.map((message) => `${message.user.username}说：${message.content}`));
      void drainSpeakQueue();
    }
  };

  const speakText = async (text: string) => {
    try {
      const response = await fetch(apiUrl("/api/chat/tts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) return;

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = ttsVolumeRef.current;

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.play().catch(() => {
          URL.revokeObjectURL(url);
          resolve();
        });
      });
    } catch {}
  };

  const drainSpeakQueue = async () => {
    if (isSpeaking.current) return;
    isSpeaking.current = true;

    try {
      while (speakQueue.current.length > 0) {
        const text = speakQueue.current.shift();
        if (!text) continue;
        await speakText(text);
      }
    } finally {
      isSpeaking.current = false;
    }
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (cancelled || document.hidden) return;
      await fetchMessages();
    };

    void run();
    const interval = window.setInterval(() => {
      void run();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || messages.length === 0) return;

    if (isFirstLoad.current) {
      element.scrollTop = element.scrollHeight;
      isFirstLoad.current = false;
      return;
    }

    if (element.scrollHeight - element.scrollTop - element.clientHeight < 120) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;

    setSending(true);
    const response = await fetch(apiUrl("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: input.trim() }),
    });
    setSending(false);

    if (response.ok) {
      setInput("");
      await fetchMessages();
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  };

  return (
    <div className="grid h-[26rem] min-h-0 grid-rows-[auto_1fr_auto] bg-background lg:h-[28rem]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-4 sm:px-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{messages.length} 条消息</Badge>
            <Badge variant="secondary">TTS</Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">消息会持续刷新，新消息按顺序播报。</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>音量</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={ttsVolume}
            onChange={(event) => {
              const next = Number(event.target.value);
              setTtsVolume(next);
              localStorage.setItem("tts-volume", String(next));
            }}
            className="h-1.5 w-24 cursor-pointer accent-primary"
          />
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 px-5 text-center text-sm text-muted-foreground">
            还没有聊天记录，发一句开场白吧。
          </div>
        ) : (
          messages.map((message, index) => {
            const mine = message.user.id === user?.id;
            const showMeta = index === 0 || messages[index - 1].user.id !== message.user.id;

            return (
              <div key={message.id} className={`flex gap-3 ${mine ? "justify-end" : "justify-start"}`}>
                {!mine ? (
                  <Avatar className="mt-1 h-9 w-9 shrink-0 border border-border/60">
                    <AvatarImage src={message.user.avatar || ""} />
                    <AvatarFallback>{message.user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                ) : null}

                <div className="max-w-[86%] space-y-1">
                  {showMeta ? (
                    <div className={`flex items-center gap-2 text-xs text-muted-foreground ${mine ? "justify-end" : "justify-start"}`}>
                      <span>{message.user.username}</span>
                      <span>{formatTime(message.createdAt)}</span>
                    </div>
                  ) : null}
                  <div className={`rounded-2xl px-4 py-3 text-sm leading-6 ${mine ? "bg-primary text-primary-foreground" : "border border-border/60 bg-muted/20"}`}>
                    {message.content}
                  </div>
                </div>

                {mine ? (
                  <Avatar className="mt-1 h-9 w-9 shrink-0 border border-border/60">
                    <AvatarImage src={message.user.avatar || ""} />
                    <AvatarFallback>{message.user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {user ? (
        <div className="border-t border-border/60 px-4 py-4 sm:px-5">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void handleSend()}
              placeholder="说点什么"
              className="h-11"
            />
            <Button className="h-11 px-4" onClick={() => void handleSend()} disabled={sending || !input.trim()}>
              {sending ? "发送中" : "发送"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border/60 px-4 py-4 text-center text-sm text-muted-foreground sm:px-5">
          登录后才能在音乐室里聊天。
        </div>
      )}
    </div>
  );
}
