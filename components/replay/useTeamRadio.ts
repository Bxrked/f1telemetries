"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type RadioClip = { t: number; num: number; url: string };

/* A clip queued behind the one playing is dropped if the race has moved
   on this far without it — radio from two corners ago is noise. */
const STALE_MS = 20_000;

/**
 * Team radio playback for the replay: one clip at a time, a short queue,
 * and pause/resume that follows the replay's own play state.
 *
 * `speakingRef` mirrors `speaking` for the canvas, which reads it every
 * frame without re-rendering.
 *
 * Browsers refuse audio that no click started. The replay autoplays on
 * load, so the first auto clip can be refused — `blocked` flips on, the
 * clip is held, and `unblock()` (called from a click) plays it.
 */
export function useTeamRadio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queue = useRef<RadioClip[]>([]);
  const held = useRef<RadioClip | null>(null);
  const speakingRef = useRef<number | null>(null);
  const [current, setCurrent] = useState<RadioClip | null>(null);
  const [blocked, setBlocked] = useState(false);

  const audio = () => (audioRef.current ??= new Audio());

  const start = useCallback((clip: RadioClip) => {
    const el = audio();
    el.src = clip.url;
    el.onended = () => next();
    el.onerror = () => next();
    setCurrent(clip);
    speakingRef.current = clip.num;
    el.play().then(
      () => setBlocked(false),
      (err) => {
        if (err?.name === "NotAllowedError") {
          held.current = clip;
          setBlocked(true);
        }
        setCurrent(null);
        speakingRef.current = null;
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = useCallback(() => {
    const clip = queue.current.shift();
    if (clip) start(clip);
    else {
      setCurrent(null);
      speakingRef.current = null;
    }
  }, [start]);

  /** Play now, replacing whatever is on. */
  const play = useCallback(
    (clip: RadioClip) => {
      queue.current = [];
      start(clip);
    },
    [start]
  );

  /** Play when free; hold at most two behind the current clip. */
  const enqueue = useCallback(
    (clip: RadioClip, raceT: number) => {
      queue.current = queue.current.filter((c) => raceT - c.t < STALE_MS);
      const el = audioRef.current;
      const busy = el && !el.paused && !el.ended && speakingRef.current != null;
      if (!busy) start(clip);
      else if (queue.current.length < 2) queue.current.push(clip);
    },
    [start]
  );

  const stop = useCallback(() => {
    queue.current = [];
    audioRef.current?.pause();
    setCurrent(null);
    speakingRef.current = null;
  }, []);

  /* Follow the replay: pausing the race pauses the radio mid-sentence. */
  const setRacePlaying = useCallback((racePlaying: boolean) => {
    const el = audioRef.current;
    if (!el || speakingRef.current == null) return;
    if (racePlaying && el.paused) el.play().catch(() => {});
    if (!racePlaying && !el.paused) el.pause();
  }, []);

  const unblock = useCallback(() => {
    setBlocked(false);
    const clip = held.current;
    held.current = null;
    if (clip) start(clip);
  }, [start]);

  /** How far through the clip on air (0–1), or null before its length is known. Read per frame. */
  const progress = useCallback(() => {
    const el = audioRef.current;
    return el && el.duration > 0 && Number.isFinite(el.duration) ? Math.min(1, el.currentTime / el.duration) : null;
  }, []);

  /* Never leave audio playing behind the page. */
  useEffect(() => () => audioRef.current?.pause(), []);

  return useMemo(
    () => ({ current, blocked, speakingRef, play, enqueue, stop, setRacePlaying, unblock, progress }),
    [current, blocked, play, enqueue, stop, setRacePlaying, unblock, progress]
  );
}
