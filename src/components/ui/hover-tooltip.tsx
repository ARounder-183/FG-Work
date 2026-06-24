"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";

interface Props {
  children: ReactNode;
  label?: string;
  className?: string;
}

export function HoverTooltip({ children, label, className = "" }: Props) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const textRef = useRef<HTMLSpanElement | null>(null);
  const showTimer = useRef<number | null>(null);
  const tooltipText = label ?? (typeof children === "string" ? children : "");

  const updatePosition = useCallback((event: MouseEvent) => {
    const offsetX = 14;
    const offsetY = 18;
    const maxX = window.innerWidth - 320;
    const maxY = window.innerHeight - 80;

    setPosition({
      x: Math.max(8, Math.min(event.clientX + offsetX, maxX)),
      y: Math.max(8, Math.min(event.clientY + offsetY, maxY)),
    });
  }, []);

  const isTruncated = useCallback(() => {
    const element = textRef.current;
    return !!element && element.scrollWidth > element.clientWidth;
  }, []);

  const handleMouseEnter = useCallback(
    (event: MouseEvent) => {
      if (!isTruncated()) return;

      updatePosition(event);
      showTimer.current = window.setTimeout(() => {
        setVisible(true);
      }, 250);
    },
    [isTruncated, updatePosition],
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!isTruncated()) return;

      updatePosition(event);
    },
    [isTruncated, updatePosition],
  );

  const hideTooltip = useCallback(() => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible) return;

    window.addEventListener("scroll", hideTooltip, true);
    return () => {
      window.removeEventListener("scroll", hideTooltip, true);
    };
  }, [hideTooltip, visible]);

  if (!tooltipText) return <>{children}</>;

  return (
    <>
      <span
        ref={textRef}
        className={`block min-w-0 ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={hideTooltip}
      >
        {children}
      </span>
      {visible
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[9999] max-w-xs animate-in fade-in duration-200 whitespace-normal break-words rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg"
              style={{ left: position.x, top: position.y }}
            >
              {tooltipText}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
