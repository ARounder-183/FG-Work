"use client";

import { apiUrl } from "@/lib/url";
import React, { createContext, useContext, useState, useEffect } from "react";
import { usePathname } from "next/navigation";

interface MusicCtx {
  currentSong: { name: string; artists: string } | null;
  isPlaying: boolean;
}

const MusicContext = createContext<MusicCtx>({ currentSong: null, isPlaying: false });

export function MusicProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [currentSong, setCurrentSong] = useState<MusicCtx["currentSong"]>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (pathname === "/music") return;

    let cancelled = false;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(apiUrl("/api/music/state"));
        if (cancelled) return;
        const d = await r.json();
        if (d.state?.currentSong) {
          setCurrentSong(d.state.currentSong);
          setIsPlaying(d.state.isPlaying || false);
        } else {
          setCurrentSong(null);
          setIsPlaying(false);
        }
      } catch {}
    };

    void poll();
    const i = window.setInterval(() => {
      void poll();
    }, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(i);
    };
  }, [pathname]);

  return <MusicContext.Provider value={{ currentSong, isPlaying }}>{children}</MusicContext.Provider>;
}

export function useMusic() {
  return useContext(MusicContext);
}
