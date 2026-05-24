"use client";

import { apiUrl } from "@/lib/url";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface CalendarDay {
  date: string;
  seconds: number;
}

interface StreakData {
  streak: number;
  longest: number;
  totalDays: number;
  totalSeconds: number;
  days: CalendarDay[];
}

function formatHMS(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function StatsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth() + 1);

  const fetchStreak = useCallback(async () => {
    if (!user) return;
    const r = await fetch(apiUrl("/api/stats/streak"));
    const d = await r.json();
    if (d.streak !== undefined) setStreak(d);
  }, [user]);

  const fetchCalendar = useCallback(async (year: number, month: number) => {
    if (!user) return;
    const r = await fetch(apiUrl(`/api/stats/calendar?month=${year}-${String(month).padStart(2, "0")}`));
    const d = await r.json();
    setCalendarDays(d.days || []);
  }, [user]);

  useEffect(() => {
    Promise.all([fetchStreak(), fetchCalendar(viewYear, viewMonth)]).then(() => setLoading(false));
  }, [fetchStreak, fetchCalendar, viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear(viewYear - 1); setViewMonth(12); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewYear(viewYear + 1); setViewMonth(1); }
    else setViewMonth(viewMonth + 1);
  };

  if (loading) return <div className="mx-auto max-w-3xl space-y-4 px-4 py-8"><Skeleton className="h-64 w-full"/><Skeleton className="h-48 w-full"/></div>;
  if (!user) return <div className="py-20 text-center text-muted-foreground">请先登录</div>;

  // Calendar grid
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay();
  const dayMap = new Map(calendarDays.map((d) => [d.date, d.seconds]));
  const maxSec = Math.max(...calendarDays.map((d) => d.seconds), 1);

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-bold">学习统计</h1>

      {/* Streak cards */}
      {streak && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-3xl font-bold text-primary">{streak.streak}</div>
              <div className="text-xs text-muted-foreground mt-1">当前连续</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-3xl font-bold">{streak.longest}</div>
              <div className="text-xs text-muted-foreground mt-1">最长连续</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-3xl font-bold">{streak.totalDays}</div>
              <div className="text-xs text-muted-foreground mt-1">累计天数</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-xl font-bold tabular-nums">{formatHMS(streak.totalSeconds)}</div>
              <div className="text-xs text-muted-foreground mt-1">累计时长</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Calendar */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">学习日历</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={prevMonth}>&lt;</Button>
              <span className="text-sm font-medium tabular-nums">{viewYear}年{viewMonth}月</span>
              <Button variant="outline" size="sm" onClick={nextMonth}>&gt;</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
            {["日","一","二","三","四","五","六"].map((d) => <div key={d}>{d}</div>)}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells before first day */}
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} className="aspect-square" />)}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const sec = dayMap.get(dateStr) || 0;
              const intensity = sec > 0 ? Math.max(0.15, Math.min(1, sec / maxSec)) : 0;
              const isToday = dateStr === todayStr;

              return (
                <div
                  key={day}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-md text-xs ${
                    sec > 0 ? "text-primary-foreground" : "text-muted-foreground"
                  } ${isToday ? "ring-2 ring-primary" : ""}`}
                  style={{ backgroundColor: sec > 0 ? `oklch(0.55 0.2 264 / ${intensity})` : "transparent" }}
                  title={sec > 0 ? `${dateStr}: ${formatHMS(sec)}` : dateStr}
                >
              <span className={isToday ? "font-bold text-[10px] sm:text-xs" : "text-[10px] sm:text-xs"}>{day}</span>
              {sec > 0 && <span className="text-[6px] sm:text-[8px] leading-none mt-0.5 hidden sm:inline">{formatHMS(sec)}</span>}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>少</span>
            {[0.15, 0.35, 0.55, 0.75, 1].map((v) => (
              <div key={v} className="h-3 w-3 rounded-sm" style={{ backgroundColor: `oklch(0.55 0.2 264 / ${v})` }} />
            ))}
            <span>多</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
