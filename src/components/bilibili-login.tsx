"use client";

import { apiUrl } from "@/lib/url";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onLoginSuccess: (uname: string) => void;
}

export function BilibiliLogin({ open, onClose, onLoginSuccess }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrKey, setQrKey] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "waiting" | "scanned" | "expired" | "success">("loading");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Generate QR code
  useEffect(() => {
    if (!open) return;

    setStatus("loading");
    setError(null);
    setQrDataUrl(null);

    fetch(apiUrl("/api/bilibili/login/qrcode"))
      .then((r) => r.json())
      .then((d) => {
        if (d.url && d.qrcodeKey) {
          setQrKey(d.qrcodeKey);
          setQrDataUrl(`/api/bilibili/login/qrimg?url=${encodeURIComponent(d.url)}`);
          setStatus("waiting");
        } else {
          setError(d.error || "生成二维码失败");
        }
      })
      .catch(() => setError("网络错误，请重试"));

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open]);

  // Poll login status
  useEffect(() => {
    if (!qrKey || status !== "waiting" || !open) return;

    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(apiUrl(`/api/bilibili/login/poll?key=${qrKey}`));
        const d = await r.json();

        if (d.status === "success") {
          clearInterval(pollRef.current!);
          setStatus("success");
          const uname = d.uname || "B站用户";
          toast.success(`B站登录成功：${uname}`);
          onLoginSuccess(uname);
          setTimeout(onClose, 2000);
        } else if (d.status === "scanned") {
          setStatus("scanned");
        } else if (d.status === "expired") {
          clearInterval(pollRef.current!);
          setStatus("expired");
        }
      } catch { /* silent */ }
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [qrKey, status, open, onClose, onLoginSuccess]);

  const refreshQR = () => {
    setQrDataUrl(null);
    setQrKey(null);
    setStatus("loading");
    fetch(apiUrl("/api/bilibili/login/qrcode"))
      .then((r) => r.json())
      .then((d) => {
        if (d.url && d.qrcodeKey) {
          setQrKey(d.qrcodeKey);
          setQrDataUrl(`/api/bilibili/login/qrimg?url=${encodeURIComponent(d.url)}`);
          setStatus("waiting");
        } else {
          setError(d.error || "生成失败");
        }
      });
  };

  if (!open) return null;

  const statusText: Record<string, string> = {
    loading: "生成二维码中...",
    waiting: "请使用B站APP扫码",
    scanned: "已扫码，请在手机上确认",
    expired: "二维码已过期",
    success: "登录成功！",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-72 rounded-xl bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 text-center text-sm font-semibold">B站扫码登录</div>

        {error ? (
          <div className="text-center">
            <p className="mb-3 text-xs text-destructive">{error}</p>
            <button onClick={onClose} className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground">关闭</button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex justify-center">
              {qrDataUrl ? (
                <div className={`rounded-lg border-2 p-2 ${status === "expired" ? "opacity-30" : ""}`}>
                  <img src={qrDataUrl} alt="QR Code" width={180} height={180} />
                </div>
              ) : (
                <div className="flex h-[196px] w-[196px] items-center justify-center rounded-lg bg-muted">
                  <span className="text-xs text-muted-foreground">加载中...</span>
                </div>
              )}
            </div>

            <div className="mb-4 text-center">
              {status === "success" ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-lg text-green-600 dark:bg-green-900/30 dark:text-green-400">✓</div>
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">登录成功</span>
                </div>
              ) : (
                <span className={`text-xs ${
                  status === "expired" ? "text-destructive"
                  : status === "scanned" ? "text-blue-500"
                  : "text-muted-foreground"
                }`}>
                  {status === "waiting" && <span className="mr-1 inline-block animate-pulse">●</span>}
                  {statusText[status]}
                </span>
              )}
            </div>

            <div className="flex justify-center gap-2">
              {status === "expired" && (
                <button onClick={refreshQR} className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground">刷新</button>
              )}
              <button onClick={onClose} className="rounded bg-muted px-3 py-1 text-xs">取消</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
