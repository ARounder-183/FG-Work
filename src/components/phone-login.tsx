"use client";

import { apiUrl } from "@/lib/url";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onLoginSuccess: (uname: string) => void;
}

// geetest SDK types (loaded dynamically)
interface GeetestCaptchaObj {
  showCaptcha(): void;
  onReady(fn: () => void): void;
  onSuccess(fn: () => void): void;
  onError(fn: (err: unknown) => void): void;
  onClose(fn: () => void): void;
  getValidate(): { geetest_challenge: string; geetest_validate: string; geetest_seccode: string };
}

declare const initGeetest4: (
  config: { captchaId: string; product: string; riskType?: string },
  cb: (obj: GeetestCaptchaObj) => void,
) => void;

export function PhoneLogin({ open, onClose, onLoginSuccess }: Props) {
  const [step, setStep] = useState<"phone" | "sms">("phone");
  const [tel, setTel] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [captchaKey, setCaptchaKey] = useState<string | null>(null);
  const [captchaReady, setCaptchaReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [logging, setLogging] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const captchaObj = useRef<GeetestCaptchaObj | null>(null);
  const tokenRef = useRef<string>("");
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load geetest SDK on mount
  useEffect(() => {
    if (!open) return;
    setStep("phone");
    setTel("");
    setSmsCode("");
    setCaptchaKey(null);
    setCaptchaReady(false);
    setSending(false);
    setLogging(false);
    setCountdown(0);
    setError(null);

    fetch(apiUrl("/api/bilibili/login/captcha"))
      .then((r) => r.json())
      .then((d) => {
        if (d.token && d.geetest) {
          tokenRef.current = d.token;
          loadGeetest(d.geetest.gt, d.geetest.challenge);
        } else {
          setError("获取验证码失败");
        }
      })
      .catch(() => setError("网络错误"));

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [open]);

  function loadGeetest(gt: string, challenge: string) {
    const existing = document.querySelector("script[src*='gt4.js']");
    if (existing) existing.remove();
    const script = document.createElement("script");
    script.src = "https://static.geetest.com/v4/gt4.js";
    script.onload = () => {
      try {
        initGeetest4(
          { captchaId: gt, product: "bind", riskType: "slide" },
          (obj) => {
            captchaObj.current = obj;
            obj.onReady(() => setCaptchaReady(true));
            // On captcha success → auto-send SMS
            obj.onSuccess(() => {
              const r = obj.getValidate();
              doSendSms(r.geetest_challenge, r.geetest_validate, r.geetest_seccode);
            });
            obj.onError(() => {
              setError("人机验证失败，请重试");
              setSending(false);
            });
          },
        );
      } catch {
        setError("验证组件加载失败");
      }
    };
    script.onerror = () => setError("验证组件加载失败");
    document.head.appendChild(script);
  }

  // 点击"发送验证码" → 弹出滑块
  function handleSendSms() {
    if (!tel || tel.length < 11) {
      toast.error("请输入正确的手机号");
      return;
    }
    if (!captchaReady || !captchaObj.current) {
      toast.error("验证码组件未就绪");
      return;
    }
    setSending(true);
    setError(null);
    captchaObj.current.showCaptcha();
  }

  // 滑块通过后实际发送短信
  function doSendSms(challenge: string, validate: string, seccode: string) {
    fetch(apiUrl("/api/bilibili/login/sms/send"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tel,
        cid: "86",
        token: tokenRef.current,
        challenge,
        validate,
        seccode,
      }),
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
              if (c <= 1) {
                if (countdownRef.current) clearInterval(countdownRef.current);
                return 0;
              }
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
    if (!smsCode || smsCode.length < 4) {
      toast.error("请输入验证码");
      return;
    }
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
      <div
        className="w-80 rounded-xl bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 text-center text-sm font-semibold">B站手机号登录</div>

        {error && (
          <div className="mb-3 rounded bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">{error}</div>
        )}

        {step === "phone" ? (
          <>
            <div className="mb-4">
              <label className="mb-1 block text-xs text-muted-foreground">手机号</label>
              <div className="flex gap-1">
                <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md border bg-muted text-sm">+86</span>
                <input
                  type="tel"
                  placeholder="请输入手机号"
                  value={tel}
                  onChange={(e) => setTel(e.target.value)}
                  maxLength={11}
                  className="h-10 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>

            <button
              onClick={handleSendSms}
              disabled={sending || !captchaReady}
              className="h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "验证中..." : "发送验证码"}
            </button>
          </>
        ) : (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-muted-foreground">验证码已发送至 {tel}</label>
              <input
                type="tel"
                placeholder="请输入验证码"
                value={smsCode}
                onChange={(e) => setSmsCode(e.target.value)}
                maxLength={6}
                autoFocus
                className="h-10 w-full rounded-md border bg-background px-3 text-center text-lg tracking-widest outline-none focus:border-primary"
              />
            </div>

            <div className="mb-3 text-center text-xs text-muted-foreground">
              没收到？
              <button
                onClick={handleSendSms}
                disabled={countdown > 0}
                className="ml-1 text-primary disabled:text-muted-foreground"
              >
                {countdown > 0 ? `${countdown}s 后重发` : "重新发送"}
              </button>
            </div>

            <button
              onClick={handleLogin}
              disabled={logging || smsCode.length < 4}
              className="h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
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
