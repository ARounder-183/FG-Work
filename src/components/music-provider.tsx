"use client";

import { apiUrl } from "@/lib/url";
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

interface MusicCtx {
  currentSong: { name: string; artists: string } | null;
  isPlaying: boolean;
}

const MusicContext = createContext<MusicCtx>({ currentSong: null, isPlaying: false });

export function MusicProvider({ children }: { children: React.ReactNode }) {
  const [currentSong, setCurrentSong] = useState<MusicCtx["currentSong"]>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch(apiUrl("/api/music/state"));
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
    poll();
    const i = setInterval(poll, 3000);
    return () => clearInterval(i);
  }, []);

  return <MusicContext.Provider value={{ currentSong, isPlaying }}>{children}</MusicContext.Provider>;
}

export function useMusic() {
  return useContext(MusicContext);
}
