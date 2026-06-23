"use client";

import { apiUrl } from "@/lib/url";
import React, { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface NowPlayingSong {
  name: string;
  artists: string;
}

interface MusicCtx {
  currentSong: NowPlayingSong | null;
  isPlaying: boolean;
}

declare global {
  interface WindowEventMap {
    "fg-music-state": CustomEvent<MusicCtx>;
  }
}

const MusicContext = createContext<MusicCtx>({ currentSong: null, isPlaying: false });

export function MusicProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [currentSong, setCurrentSong] = useState<MusicCtx["currentSong"]>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const handleMusicState = (event: WindowEventMap["fg-music-state"]) => {
      setCurrentSong(event.detail.currentSong);
      setIsPlaying(event.detail.isPlaying);
    };

    window.addEventListener("fg-music-state", handleMusicState as EventListener);
    return () => window.removeEventListener("fg-music-state", handleMusicState as EventListener);
  }, []);

  useEffect(() => {
    if (pathname === "/music") return;

    let cancelled = false;
    let timer: number | null = null;

    const run = async () => {
      if (cancelled) return;

      if (!document.hidden) {
        try {
          const response = await fetch(apiUrl("/api/music/state"));
          if (!response.ok || cancelled) return;

          const data = await response.json();
          if (cancelled) return;

          setCurrentSong(data.state?.currentSong ?? null);
          setIsPlaying(data.state?.isPlaying || false);
        } catch {}
      }

      timer = window.setTimeout(run, document.hidden ? 12000 : 8000);
    };

    void run();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [pathname]);

  return <MusicContext.Provider value={{ currentSong, isPlaying }}>{children}</MusicContext.Provider>;
}

export function useMusic() {
  return useContext(MusicContext);
}
