"use client";

import { apiUrl } from "@/lib/url";
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./auth-provider";

interface ActiveCheckIn {
  id: string;
  startedAt: string;
  topicId: string;
  topicName: string;
  topicIcon: string | null;
}

interface StudyContextType {
  active: ActiveCheckIn | null;
  todayMinutes: number;
  refreshStudy: () => Promise<void>;
}

const StudyContext = createContext<StudyContextType>({
  active: null,
  todayMinutes: 0,
  refreshStudy: async () => {},
});

export function StudyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [active, setActive] = useState<ActiveCheckIn | null>(null);
  const [todayMinutes, setTodayMinutes] = useState(0);

  const refreshStudy = useCallback(async () => {
    if (!user) return;
    try {
      const [activeRes, todayRes] = await Promise.all([
        fetch(apiUrl("/api/checkin/active")),
        fetch(apiUrl("/api/checkin/today")),
      ]);
      const activeData = await activeRes.json();
      const todayData = await todayRes.json();

      if (activeData.active) {
        setActive({
          id: activeData.active.id,
          startedAt: activeData.active.startedAt,
          topicId: activeData.active.topic.id,
          topicName: activeData.active.topic.name,
          topicIcon: activeData.active.topic.icon,
        });
      } else {
        setActive(null);
      }
      setTodayMinutes(todayData.totalMinutes || 0);
    } catch {
      setActive(null);
    }
  }, [user]);

  useEffect(() => {
    refreshStudy();
    const interval = setInterval(refreshStudy, 10000);
    return () => clearInterval(interval);
  }, [refreshStudy]);

  return (
    <StudyContext.Provider value={{ active, todayMinutes, refreshStudy }}>
      {children}
    </StudyContext.Provider>
  );
}

export function useStudy() {
  return useContext(StudyContext);
}
