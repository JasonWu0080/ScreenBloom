"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drives the preview <video> within the selected range: plays at output speed, and at the
 * end of the selection either loops back to the start or stops, as the user chose.
 * No encoding happens here — the preview is the browser's own playback of the source.
 */
export function usePlayback(video: HTMLVideoElement | null, opts: { start: number; end: number; speed: number; loop: boolean }) {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const optsRef = useRef(opts);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  useEffect(() => {
    videoRef.current = video;
    if (!video) return;
    const sync = () => setCurrent(video.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const events: [string, () => void][] = [
      ["timeupdate", sync],
      ["seeked", sync],
      ["loadedmetadata", sync],
      ["play", onPlay],
      ["pause", onPause],
      ["ended", onPause],
    ];
    for (const [name, fn] of events) video.addEventListener(name, fn);
    return () => {
      for (const [name, fn] of events) video.removeEventListener(name, fn);
    };
  }, [video]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = opts.speed;
  }, [video, opts.speed]);

  // Frame-accurate boundary enforcement while playing.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playing) return;
    const state = { raf: 0 };
    const tick = () => {
      const { start, end, loop } = optsRef.current;
      if (v.currentTime >= end - 0.005 || v.ended) {
        if (loop) {
          v.currentTime = start;
          if (v.paused) void v.play().catch(() => {});
        } else {
          v.pause();
          v.currentTime = end;
        }
      }
      setCurrent(v.currentTime);
      state.raf = requestAnimationFrame(tick);
    };
    state.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(state.raf);
  }, [video, playing]);

  const play = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const { start, end } = optsRef.current;
    if (v.currentTime < start || v.currentTime >= end - 0.05) v.currentTime = start;
    void v.play().catch(() => {});
  }, []);

  const pause = useCallback(() => videoRef.current?.pause(), []);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setCurrent(t);
  }, []);

  return { current, playing, play, pause, seek };
}
