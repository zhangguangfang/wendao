import { useCallback, useEffect, useRef, useState } from "react";

/** A voluntary pause counts only visible, explicitly running time. */
export function usePauseTimer(durationSeconds = 60) {
  const duration = durationSeconds * 1000;
  const elapsedRef = useRef(0);
  const startedRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [backgroundPaused, setBackgroundPaused] = useState(false);
  const total = useCallback(() => Math.min(duration, elapsedRef.current + (startedRef.current === null ? 0 : Math.max(0, performance.now() - startedRef.current))), [duration]);
  const pause = useCallback(() => {
    elapsedRef.current = total();
    startedRef.current = null;
    setElapsed(elapsedRef.current);
    setRunning(false);
  }, [total]);
  function start() {
    if (startedRef.current !== null || document.hidden || elapsedRef.current >= duration) return;
    startedRef.current = performance.now();
    setBackgroundPaused(false);
    setRunning(true);
  }
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      const next = total();
      if (next >= duration) pause();
      else setElapsed(next);
    }, 200);
    return () => window.clearInterval(timer);
  }, [running, total, pause, duration]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden && startedRef.current !== null) { pause(); setBackgroundPaused(true); }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [pause]);
  return { start, pause, running, backgroundPaused, remaining: Math.ceil((duration - elapsed) / 1000), done: elapsed >= duration };
}
