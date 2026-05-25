"use client";

import { apiUrl } from "@/lib/url";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
  const captchaObj = useRef<any>(null);
  const tokenRef = useRef<string>("");
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("phone");
    setTel("");
    setSmsCode("");
    setCaptchaKey(null);
    setSending(false);
    setLogging(false);
    setCountdown(0);
    setError(null);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [open]);

  // 点击"发送验证码" → 拉取 captcha token → 弹出滑块
  async function handleSendSms() {
    if (!tel || tel.length < 11) {
      toast.error("请输入正确的手机号");
      return;
    }
    setSending(true);
    setError(null);

    try {
      // Step 1: 拉取 captcha token
      const r = await fetch(apiUrl("/api/bilibili/login/captcha"));
      const d = await r.json();
      console.log("[phone] captcha:", d);
      if (!d.token || !d.geetest?.gt) {
        setSending(false);
        setError("获取验证码失败: " + (d.error || "无 token"));
        return;
      }
      tokenRef.current = d.token;

      // Step 2: 加载 geetest 并弹出滑块
      showGeetest(d.geetest.gt, d.geetest.challenge);
    } catch {
      setSending(false);
      setError("网络错误，请重试");
    }
  }

  function showGeetest(gt: string, challenge: string) {
    const old = document.querySelector("script[src*='geetest']");
    if (old) old.remove();

    const script = document.createElement("script");
    // B站 使用 geetest v3 SDK
    script.src = "https://static.geetest.com/static/js/gt.0.4.9.js";
    script.onload = () => {
      const init = (window as any).initGeetest;
      if (!init) {
        setSending(false);
        setError("验证组件加载失败(initGeetest not found)");
        return;
      }
      try {
        init(
          {
            gt,
            challenge,
            product: "bind",
            offline: false,
            new_captcha: true,
          },
          (obj: any) => {
            captchaObj.current = obj;
            obj.onReady(() => {
              console.log("[geetest] ready, appending");
              const el = document.getElementById("geetest-box");
              if (el) obj.appendTo(el);
            });
            obj.onSuccess(() => {
              console.log("[geetest] success");
              const r = obj.getValidate();
              doSendSms(r.geetest_challenge, r.geetest_validate, r.geetest_seccode);
            });
            obj.onError((err: unknown) => {
              console.warn("[geetest] error:", err);
              setSending(false);
              setError("人机验证失败，请重试");
            });
            obj.onClose(() => {
              setSending(false);
            });
          },
        );
      } catch (e) {
        console.error("[geetest] exception:", e);
        setSending(false);
        setError("验证组件加载失败");
      }
    };
    script.onerror = () => {
      setSending(false);
      setError("验证组件加载失败");
    };
    document.head.appendChild(script);
  }

  // 滑块通过 → 发短信
  function doSendSms(challenge: string, validate: string, seccode: string) {
    fetch(apiUrl("/api/bilibili/login/sms/send"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tel, cid: "86", token: tokenRef.current, challenge, validate, seccode }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.captchaKey) {
          setCaptchaKey(d.captchaKey);
          setStep("sms");
          setCountdown(60);
          toast.success("验证码已发送");
          countdownRef.current = setInterval(() => {
            setCountdown((c) => {
              if (c <= 1) { if (countdownRef.current) clearInterval(countdownRef.current); return 0; }
              return c - 1;
            });
          }, 1000);
        } else {
          setError(d.error || "发送失败");
        }
      })
      .catch(() => setError("网络错误"))
      .finally(() => setSending(false));
  }

  function handleLogin() {
    if (!smsCode || smsCode.length < 4) { toast.error("请输入验证码"); return; }
    setLogging(true);
    setError(null);
    fetch(apiUrl("/api/bilibili/login/sms/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tel, cid: "86", code: smsCode, captchaKey }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          toast.success(`B站登录成功：${d.uname}`);
          onLoginSuccess(d.uname);
          setTimeout(onClose, 1500);
        } else {
          setError(d.error || "登录失败");
        }
      })
      .catch(() => setError("网络错误"))
      .finally(() => setLogging(false));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-80 rounded-xl bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 text-center text-sm font-semibold">B站手机号登录</div>

        {error && <div className="mb-3 rounded bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">{error}</div>}

        {step === "phone" ? (
          <>
            <div className="mb-4">
              <label className="mb-1 block text-xs text-muted-foreground">手机号</label>
              <div className="flex gap-1">
                <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md border bg-muted text-sm">+86</span>
                <input type="tel" placeholder="请输入手机号" value={tel} onChange={(e) => setTel(e.target.value)} maxLength={11}
                  className="h-10 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary" />
              </div>
            </div>

            {/* geetest 嵌入容器 */}
            <div id="geetest-box" className="mb-4 flex justify-center" />

            <button onClick={handleSendSms} disabled={sending}
              className="h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              {sending ? "获取验证码中..." : "发送验证码"}
            </button>
          </>
        ) : (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-muted-foreground">验证码已发送至 {tel}</label>
              <input type="tel" placeholder="请输入验证码" value={smsCode} onChange={(e) => setSmsCode(e.target.value)} maxLength={6} autoFocus
                className="h-10 w-full rounded-md border bg-background px-3 text-center text-lg tracking-widest outline-none focus:border-primary" />
            </div>
            <div className="mb-3 text-center text-xs text-muted-foreground">
              没收到？
              <button onClick={handleSendSms} disabled={countdown > 0 || sending} className="ml-1 text-primary disabled:text-muted-foreground">
                {countdown > 0 ? `${countdown}s 后重发` : "重新发送"}
              </button>
            </div>
            <button onClick={handleLogin} disabled={logging || smsCode.length < 4}
              className="h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
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
