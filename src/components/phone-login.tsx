"use client";

import { apiUrl } from "@/lib/url";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface TencentCaptchaResult {
  ret: number;
  ticket?: string;
  randstr?: string;
}

interface GeetestValidateResult {
  geetest_challenge: string;
  geetest_validate: string;
  geetest_seccode: string;
}

interface GeetestInstance {
  appendTo: (element: HTMLElement) => void;
  onSuccess: (callback: () => void) => void;
  onError: (callback: () => void) => void;
  onClose: (callback: () => void) => void;
  getValidate: () => GeetestValidateResult;
}

declare global {
  interface Window {
    TencentCaptcha?: new (
      appid: string,
      callback: (result: TencentCaptchaResult) => void,
    ) => { show: () => void };
    initGeetest?: (
      config: {
        gt: string;
        challenge: string;
        offline: boolean;
        new_captcha: boolean;
        product: string;
        https: boolean;
        width: string;
      },
      callback: (instance: GeetestInstance) => void,
    ) => void;
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  onLoginSuccess: (uname: string) => void;
}

export function PhoneLogin({ open, onClose, onLoginSuccess }: Props) {
  const [step, setStep] = useState<"phone" | "sms">("phone");
  const [tel, setTel] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [captchaKey, setCaptchaKey] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [logging, setLogging] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string>("");
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captchaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("phone");
    setTel(""); setSmsCode(""); setCaptchaKey(null);
    setSending(false); setLogging(false); setCountdown(0); setError(null);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      clearCaptchaTimeout();
    };
  }, [open]);

  // 超时兜底：防止验证码 SDK 回调永不触发导致页面卡死
  function startCaptchaTimeout() {
    if (captchaTimerRef.current) clearTimeout(captchaTimerRef.current);
    captchaTimerRef.current = setTimeout(() => {
      console.warn("[phone] captcha timeout — SDK callback never fired");
      setSending(false);
      setError("验证超时，请重试");
    }, 15000);
  }

  function clearCaptchaTimeout() {
    if (captchaTimerRef.current) { clearTimeout(captchaTimerRef.current); captchaTimerRef.current = null; }
  }

  async function handleSendSms() {
    if (!tel || tel.length < 11) { toast.error("请输入正确的手机号"); return; }
    setSending(true);
    setError(null);
    try {
      const r = await fetch(apiUrl("/api/bilibili/login/captcha"));
      const d = await r.json();
      console.log("[phone] captcha:", d);
      if (!d.token) { setSending(false); setError("获取验证码失败"); return; }
      tokenRef.current = d.token;

      // geetest 优先（无域名限制，第三方应用可用），TCaptcha 兜底（绑定 bilibili.com 域名）
      if (d.geetest?.gt && d.geetest?.challenge) {
        showGeetest(d.geetest.gt, d.geetest.challenge);
      } else if (d.tencent?.appid) {
        showTCaptcha(d.tencent.appid);
      } else {
        setSending(false); setError("未获取到验证码配置");
      }
    } catch { setSending(false); setError("网络错误，请重试"); }
  }

  // ═══ 腾讯防水墙（兜底，通常有域名限制） ═══
  function showTCaptcha(appid: string) {
    startCaptchaTimeout();
    const old = document.querySelector("script[src*='TCaptcha']");
    if (old) old.remove();
    const script = document.createElement("script");
    script.src = "https://t.captcha.qq.com/TCaptcha.js";
    script.onload = () => {
      const C = window.TencentCaptcha;
      if (!C) { clearCaptchaTimeout(); setSending(false); setError("验证组件加载失败"); return; }
      new C(appid, (res) => {
        console.log("[tcaptcha]", res);
        clearCaptchaTimeout();
        if (res.ret === 0 && res.ticket) {
          doSendSms(res.ticket, res.randstr || "", "");
        } else {
          setSending(false);
          if (res.ret !== 2) setError("人机验证未通过");
        }
      }).show();
    };
    script.onerror = () => { clearCaptchaTimeout(); setSending(false); setError("验证组件加载失败"); };
    document.head.appendChild(script);
  }

  // ═══ geetest v3（参考 BBPlayer 实现） ═══
  function showGeetest(gt: string, challenge: string) {
    startCaptchaTimeout();
    // 先创建弹层容器
    const box = document.createElement("div");
    box.id = "gt-popup";
    box.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.3)";
    document.body.appendChild(box);
    // 加载 geetest v3 SDK
    const old = document.querySelector("script[src*='gt.0.4.9']");
    if (old) old.remove();
    const script = document.createElement("script");
    script.src = "https://static.geetest.com/static/js/gt.0.4.9.js";
    script.onload = () => {
      const init = window.initGeetest;
      if (!init) { cleanupGeetest(); clearCaptchaTimeout(); setSending(false); setError("验证组件加载失败"); return; }
      try {
        // 参数完全匹配 BBPlayer
        init({
          gt,
          challenge,
          offline: false,
          new_captcha: true,
          product: "popup",
          https: true,
          width: "100%",
        }, (obj) => {
          obj.appendTo(box);
          obj.onSuccess(() => {
            clearCaptchaTimeout();
            cleanupGeetest();
            const r = obj.getValidate();
            doSendSms(r.geetest_challenge, r.geetest_validate, r.geetest_seccode);
          });
          obj.onError(() => { clearCaptchaTimeout(); cleanupGeetest(); setSending(false); setError("人机验证失败"); });
          obj.onClose(() => { clearCaptchaTimeout(); cleanupGeetest(); setSending(false); });
        });
      } catch { clearCaptchaTimeout(); cleanupGeetest(); setSending(false); setError("验证失败"); }
    };
    script.onerror = () => { clearCaptchaTimeout(); cleanupGeetest(); setSending(false); setError("验证组件加载失败"); };
    document.head.appendChild(script);
  }

  function cleanupGeetest() {
    document.getElementById("gt-popup")?.remove();
  }

  function doSendSms(challenge: string, validate: string, seccode: string) {
    fetch(apiUrl("/api/bilibili/login/sms/send"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tel, cid: "86", token: tokenRef.current, challenge, validate, seccode }),
    }).then(r => r.json()).then(d => {
      if (d.captchaKey) { smsSent(d.captchaKey); }
      else { setError(d.error || "发送失败"); setSending(false); }
    }).catch(() => { setError("网络错误"); setSending(false); });
  }

  function smsSent(key: string) {
    setCaptchaKey(key); setStep("sms"); setSending(false); setCountdown(60);
    toast.success("验证码已发送");
    countdownRef.current = setInterval(() => setCountdown(c => {
      if (c <= 1) { if (countdownRef.current) clearInterval(countdownRef.current); return 0; }
      return c - 1;
    }), 1000);
  }

  function handleLogin() {
    if (!smsCode || smsCode.length < 4) { toast.error("请输入验证码"); return; }
    setLogging(true); setError(null);
    fetch(apiUrl("/api/bilibili/login/sms/login"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tel, cid: "86", code: smsCode, captchaKey }),
    }).then(r => r.json()).then(d => {
      if (d.success) { toast.success("登录成功"); onLoginSuccess(d.uname); setTimeout(onClose, 1500); }
      else setError(d.error || "登录失败");
    }).catch(() => setError("网络错误")).finally(() => setLogging(false));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-80 rounded-xl bg-card p-6 shadow-lg" onClick={e => e.stopPropagation()}>
        <div className="mb-4 text-center text-sm font-semibold">B站手机号登录</div>
        {error && <div className="mb-3 rounded bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">{error}</div>}
        {step === "phone" ? (
          <>
            <div className="mb-4">
              <label className="mb-1 block text-xs text-muted-foreground">手机号</label>
              <div className="flex gap-1">
                <span className="flex h-10 w-14 items-center justify-center rounded-md border bg-muted text-sm">+86</span>
                <input type="tel" placeholder="请输入手机号" value={tel} onChange={e => setTel(e.target.value)} maxLength={11}
                  className="h-10 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary" />
              </div>
            </div>
            <button onClick={handleSendSms} disabled={sending}
              className="h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              {sending ? "获取验证码中..." : "发送验证码"}
            </button>
          </>
        ) : (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-muted-foreground">验证码已发送至 {tel}</label>
              <input type="tel" placeholder="请输入验证码" value={smsCode} onChange={e => setSmsCode(e.target.value)} maxLength={6} autoFocus
                className="h-10 w-full rounded-md border bg-background px-3 text-center text-lg tracking-widest outline-none focus:border-primary" />
            </div>
            <div className="mb-3 text-center text-xs text-muted-foreground">
              没收到？
              <button onClick={handleSendSms} disabled={countdown > 0 || sending} className="ml-1 text-primary disabled:text-muted-foreground">
                {countdown > 0 ? `${countdown}s 后重发` : "重新发送"}
              </button>
            </div>
            <button onClick={handleLogin} disabled={logging || smsCode.length < 4}
              className="h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              {logging ? "登录中..." : "登录"}
            </button>
          </>
        )}
        <div className="mt-4 flex justify-center">
          <button onClick={onClose} className="rounded bg-muted px-4 py-1.5 text-xs">取消</button>
        </div>
      </div>
    </div>
  );
}
