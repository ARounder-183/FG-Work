"use client";

import { useCallback, useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  baseVx: number;
  baseVy: number;
  radius: number;
  baseOpacity: number;
  hue: number;
  saturation: number;
  lightness: number;
  phase: number;
  swayAmp: number;
  swayFreq: number;
  glowRadius: number;
}

const PARTICLE_COUNT = 58;

// Hues drawn from the player gradient: indigo → fuchsia → rose, plus warm amber
const HUES = [230, 252, 275, 305, 330, 28, 42];

function createParticle(w: number, h: number): Particle {
  const hue = HUES[Math.floor(Math.random() * HUES.length)];
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    baseVx: (Math.random() - 0.5) * 0.1,
    baseVy: -(0.12 + Math.random() * 0.4),
    radius: 0.5 + Math.random() * 2.2,
    baseOpacity: 0.1 + Math.random() * 0.3,
    hue,
    saturation: 50 + Math.random() * 50,
    lightness: 58 + Math.random() * 38,
    phase: Math.random() * Math.PI * 2,
    swayAmp: 0.06 + Math.random() * 0.32,
    swayFreq: 0.003 + Math.random() * 0.013,
    glowRadius: 4 + Math.random() * 11,
  };
}

export function ParticleBackground({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef(0);
  const timeRef = useRef(0);
  const targetOpacityRef = useRef(active ? 1 : 0);
  const currentOpacityRef = useRef(active ? 1 : 0);

  useEffect(() => {
    targetOpacityRef.current = active ? 1 : 0;
  }, [active]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;

    if (w === 0 || h === 0) return;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () =>
      createParticle(w, h),
    );
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const animate = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      // Smooth opacity lerp — particles fade in/out over ~1s
      const target = targetOpacityRef.current;
      const current = currentOpacityRef.current;
      const next = current + (target - current) * 0.025;
      currentOpacityRef.current = next;

      ctx.clearRect(0, 0, w, h);

      if (next < 0.004) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      timeRef.current += 1;
      const t = timeRef.current;

      for (const p of particlesRef.current) {
        // Gentle sinusoidal horizontal sway
        const sway = Math.sin(t * p.swayFreq + p.phase) * p.swayAmp;
        p.x += p.baseVx + sway;
        p.y += p.baseVy;

        // Wrap particles that drift out of bounds
        if (p.y < -30) {
          p.y = h + 30;
          p.x = Math.random() * w;
        }
        if (p.x < -30) p.x = w + 30;
        if (p.x > w + 30) p.x = -30;

        // Subtle breathing pulse per particle
        const pulse = 0.6 + 0.4 * Math.sin(t * 0.016 + p.phase);
        const alpha = p.baseOpacity * pulse * next;
        if (alpha < 0.008) continue;

        const color = `hsla(${p.hue}, ${p.saturation}%, ${p.lightness}%, ${alpha})`;
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = p.glowRadius;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 1 }}
    />
  );
}
