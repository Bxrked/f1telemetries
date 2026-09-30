"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Pause, SkipBack, SkipForward, ChevronsLeft, ChevronsRight, Volume2, VolumeX, Square } from "lucide-react";
import { getReplayTimeline, getReplayGpsWindow, getTrackOutline, getPostRaceInterviews } from "@/services/f1Service";
import { createGpsBuffer, floorIndex } from "@/services/replayModel";
import { EASE, SPRING, PRESS } from "@/lib/motion";
import PageTitle from "./PageTitle";
import ReplayCanvas, { ReplayClock } from "./replay/ReplayCanvas";
import ReplayTimeline, { EVENT_COLOR } from "./replay/ReplayTimeline";
import TimingTower from "./replay/TimingTower";
import EventFeed from "./replay/EventFeed";
import Interviews from "./replay/Interviews";
import { useTeamRadio, RadioClip } from "./replay/useTeamRadio";

const SPEEDS = [1, 2, 5, 10, 30, 60];
/* Real GPS is streamed at these speeds and below. Above, a lap plays in
   a few seconds — faster than a ~1 MB lap can download — and lap mode
   is what's drawn. */
const GPS_MAX_SPEED = 5;
const UI_HZ = 8;
const LOWER_THIRD_MS = 3200;
/* Radio auto-plays at these speeds and below. A clip runs in real time,
   so above 2x the race would be a lap further on before it finished. */
const RADIO_MAX_SPEED = 2;
const LOWER_THIRD_TYPES = new Set(["fastest", "retired", "penalty", "chequered", "start"]);

const STATUS_BANNER: Record<string, { label: string; cls: string }> = {
  sc: { label: "Safety Car", cls: "bg-sector-yellow text-carbon-950" },
  vsc: { label: "Virtual Safety Car", cls: "border-2 border-dashed border-sector-yellow bg-carbon-950/90 text-sector-yellow" },
  red: { label: "Red Flag", cls: "bg-f1red text-white" },
};

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Race replay — the latest Grand Prix, every lap.
 *
 * One rAF loop owns the playback clock (a ref). The canvas reads it every
 * frame; React state is sampled from it at UI_HZ for the tower, feed and
 * timeline, so reorders and text updates never compete with the map.
 */
export default function RaceReplay() {
  const [data, setData] = useState<any>(null);
  const [outline, setOutline] = useState<any>(null);
  const [failed, setFailed] = useState(false);

  const clockRef = useRef<ReplayClock>({ t: 0, speed: 10, playing: false });
  const [ui, setUi] = useState({ t: 0, speed: 10, playing: false });
  const [focus, setFocus] = useState<number | null>(null);
  const [lowerThird, setLowerThird] = useState<any>(null);
  const [panel, setPanel] = useState<"feed" | "interviews">("feed");
  const [interviews, setInterviews] = useState<any>(null);
  const [promptDismissed, setPromptDismissed] = useState(false);
  const gpsRef = useRef<ReturnType<typeof createGpsBuffer> | null>(null);
  const [gpsLive, setGpsLive] = useState(false);

  /* Team radio. The clock loop reads the manager and the auto toggle via
     refs, so toggling never restarts the loop. */
  const radio = useTeamRadio();
  const radioRef = useRef(radio);
  radioRef.current = radio;
  const [autoRadio, setAutoRadio] = useState(true);
  const autoRadioRef = useRef(autoRadio);
  autoRadioRef.current = autoRadio;
  /* The clip a click just started — the loop must not start it again
     when the playhead crosses its timestamp a second later. */
  const handStarted = useRef<string | null>(null);

  /* Post-race interviews: one request to our own API, fetched once the
     replay has loaded so it never competes with the timeline. */
  useEffect(() => {
    if (!data) return;
    getPostRaceInterviews().then(setInterviews).catch(() => setInterviews({ status: "unreachable" }));
  }, [data]);

  /* ---- Load ---- */
  useEffect(() => {
    let cancelled = false;
    Promise.all([getReplayTimeline(), getTrackOutline()])
      .then(([d, o]) => {
        if (cancelled) return;
        if (!d || !o?.transform) return setFailed(true);
        setData(d);
        setOutline(o);
        const t0 = d.timeline.raceStart - 3000;
        clockRef.current = { t: t0, speed: 10, playing: false };
        setUi({ t: t0, speed: 10, playing: false });
        gpsRef.current = createGpsBuffer({
          fetchWindow: (from: number, to: number) => getReplayGpsWindow(d.sessionKey, from, to),
          leaderStarts: d.timeline.leaderStarts,
          raceEnd: d.timeline.raceEnd,
        });
        /* A beat on the grid, then lights out. */
        setTimeout(() => {
          if (!cancelled) {
            clockRef.current.playing = true;
            setUi((u) => ({ ...u, playing: true }));
          }
        }, 900);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const tl = data?.timeline;
  const tMin = tl ? tl.raceStart - 3000 : 0;
  const tMax = tl ? tl.raceEnd + 5000 : 0;
  const lowerTypes = useMemo(() => (data ? data.events.filter((e: any) => LOWER_THIRD_TYPES.has(e.type)) : []), [data]);
  const lowerTimes = useMemo(() => lowerTypes.map((e: any) => e.t), [lowerTypes]);
  const clips: RadioClip[] = useMemo(() => data?.radio ?? [], [data]);
  const clipTimes = useMemo(() => clips.map((c) => c.t), [clips]);

  /* ---- Clock ---- */
  useEffect(() => {
    if (!data) return;
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    let lastGps = 0;
    let hideLower: ReturnType<typeof setTimeout> | null = null;
    const loop = (now: number) => {
      const c = clockRef.current;
      const dt = Math.min(100, now - last);
      last = now;
      if (c.playing) {
        const prev = c.t;
        c.t = Math.min(tMax, c.t + dt * c.speed);
        if (c.t >= tMax) c.playing = false;
        /* Broadcast lower-third for notable events crossed in play (not
           on a seek — that would flash whatever it jumped over). */
        const i = floorIndex(lowerTimes, c.t);
        if (i >= 0 && lowerTimes[i] > prev) {
          setLowerThird({ ...lowerTypes[i], key: `${lowerTimes[i]}` });
          if (hideLower) clearTimeout(hideLower);
          hideLower = setTimeout(() => setLowerThird(null), LOWER_THIRD_MS);
        }
        /* Radio as it happens — every clip whose moment was crossed this
           frame, oldest first, at speeds where it can keep up. */
        if (autoRadioRef.current && c.speed <= RADIO_MAX_SPEED && c.t - prev < 5000) {
          for (let k = floorIndex(clipTimes, prev) + 1; k < clips.length && clips[k].t <= c.t; k++) {
            if (clips[k].url === handStarted.current) continue;
            radioRef.current.enqueue(clips[k], c.t);
          }
        }
      }
      if (now - lastGps > 250) {
        lastGps = now;
        const gps = gpsRef.current;
        if (gps && c.speed <= GPS_MAX_SPEED) gps.want(c.t);
        setGpsLive(!!gps && c.speed <= GPS_MAX_SPEED && gps.has(c.t));
      }
      if (now - lastUi > 1000 / UI_HZ) {
        lastUi = now;
        setUi({ t: c.t, speed: c.speed, playing: c.playing });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      if (hideLower) clearTimeout(hideLower);
    };
  }, [data, tMax, lowerTimes, lowerTypes, clips, clipTimes]);

  /* Pausing the race pauses the radio mid-sentence; playing resumes it. */
  useEffect(() => {
    radio.setRacePlaying(ui.playing);
  }, [ui.playing, radio]);

  /* ---- Controls ---- */
  const sync = () => setUi({ ...clockRef.current });
  const seek = useCallback(
    (t: number) => {
      clockRef.current.t = Math.max(tMin, Math.min(tMax, t));
      setLowerThird(null);
      /* Radio belongs to a moment; leaving the moment ends it. */
      radioRef.current.stop();
      handStarted.current = null;
      sync();
    },
    [tMin, tMax]
  );
  const togglePlay = useCallback(() => {
    const c = clockRef.current;
    if (!c.playing && c.t >= tMax) c.t = tMin;
    c.playing = !c.playing;
    sync();
  }, [tMin, tMax]);
  const setSpeed = useCallback((s: number) => {
    clockRef.current.speed = s;
    sync();
  }, []);
  const stepLap = useCallback(
    (dir: 1 | -1) => {
      if (!tl) return;
      const starts = tl.leaderStarts;
      const i = floorIndex(starts, clockRef.current.t);
      /* Back: to this lap's start, or the previous one if we're right on it. */
      const target =
        dir > 0
          ? starts[i + 1] ?? tMax
          : clockRef.current.t - (starts[i] ?? tMin) > 3000
            ? starts[i]
            : starts[Math.max(0, i - 1)];
      seek(target ?? tMin);
    },
    [tl, seek, tMin, tMax]
  );
  const stepEvent = useCallback(
    (dir: 1 | -1) => {
      if (!data) return;
      const evs = data.events.filter((e: any) => e.type !== "pit" && e.type !== "radio");
      const t = clockRef.current.t;
      const target = dir > 0 ? evs.find((e: any) => e.t - 4000 > t + 500) : [...evs].reverse().find((e: any) => e.t - 4000 < t - 1500);
      if (target) seek(target.t - 4000);
    },
    [data, seek]
  );
  /* Playing a clip by hand (feed or timeline): land just before it at 1x
     so the car is on screen as the message goes out. Clicking the clip
     that's already playing stops it. */
  const playRadio = useCallback(
    (e: any) => {
      if (radioRef.current.current?.url === e.url) {
        radioRef.current.stop();
        return;
      }
      seek(e.t - 1500);
      clockRef.current.speed = 1;
      clockRef.current.playing = true;
      handStarted.current = e.url;
      radioRef.current.play({ t: e.t, num: e.nums?.[0] ?? e.num, url: e.url });
      sync();
    },
    [seek]
  );

  /* Jumping to an event: land a few seconds before it at 2x, where GPS
     is live, so the moment plays out on the real racing line. */
  const jumpTo = useCallback(
    (e: any) => {
      if (e.type === "radio") return playRadio(e);
      seek(e.t - 4000);
      clockRef.current.speed = 2;
      clockRef.current.playing = true;
      if (e.nums?.length === 1) setFocus(e.nums[0]);
      sync();
    },
    [seek, playRadio]
  );

  /* Keyboard: space play/pause · ←/→ lap · ,/. event · ↑/↓ speed · Esc unfocus */
  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const idx = SPEEDS.indexOf(clockRef.current.speed);
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); stepLap(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); stepLap(-1); }
      else if (e.key === ".") stepEvent(1);
      else if (e.key === ",") stepEvent(-1);
      else if (e.key === "ArrowUp") { e.preventDefault(); setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, idx + 1)]); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setSpeed(SPEEDS[Math.max(0, idx - 1)]); }
      else if (e.key === "Escape") setFocus(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, togglePlay, stepLap, stepEvent, setSpeed]);

  /* ---- Derived UI state (sampled at UI_HZ) ---- */
  const cars = useMemo(() => (tl ? tl.snapshot(ui.t) : []), [tl, ui.t]);
  const gaps = useMemo(() => (tl ? tl.gaps(cars, ui.t) : []), [tl, cars, ui.t]);
  const lap = tl ? tl.lapAt(ui.t) : 1;
  const status = data?.status.find((s: any) => ui.t >= s.from && ui.t <= s.to) ?? null;
  const preStart = tl && ui.t < tl.raceStart;
  const chequeredAt = data?.events.find((e: any) => e.type === "chequered")?.t ?? null;

  if (failed) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 rounded-panel border border-carbon-700 bg-carbon-850 px-6 text-center">
        <p className="timing text-label font-bold uppercase tracking-wider text-carbon-300">Replay unavailable</p>
        <p className="max-w-md text-data leading-relaxed text-carbon-400">
          The replay is built from live timing and GPS for the latest race, and that data couldn&apos;t be loaded right
          now. It usually appears about 30 minutes after a race finishes.
        </p>
      </div>
    );
  }

  if (!data || !outline) {
    return (
      <div>
        <div className="skeleton mb-6 h-24 w-1/2" />
        <div className="grid gap-2 lg:h-[86vh] lg:grid-cols-[210px_1fr_250px]">
          <div className="skeleton h-40 lg:h-full" />
          <div className="skeleton h-[50vh] lg:h-full" />
          <div className="skeleton hidden lg:block" />
        </div>
        <p className="timing mt-4 flex items-center justify-center gap-2 text-micro uppercase tracking-[0.22em] text-carbon-500">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-f1red-bright" />
          Building race timeline
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        eyebrow={
          <>
            <span className="inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-f1red-bright" />
            Race replay · every lap
          </>
        }
        title={data.raceName}
        tone={(w, i) => (/^grand$|^prix$/i.test(w) ? "text-carbon-400" : "text-carbon-100")}
      />

      <div className="grid gap-2 lg:h-[86vh] lg:min-h-[640px] lg:grid-cols-[210px_1fr_250px]">
        {/* Tower */}
        <section className="order-2 flex min-h-0 flex-col rounded-panel border border-carbon-700 bg-carbon-850 p-2 shadow-panel max-lg:h-[420px] lg:order-1">
          <TimingTower data={data} cars={cars} gaps={gaps} lap={lap} t={ui.t} focus={focus} onFocus={setFocus} speaking={radio.current?.num ?? null} />
        </section>

        {/* Map */}
        <section className="relative order-1 flex min-h-0 flex-col overflow-hidden rounded-panel border border-carbon-700 bg-carbon-900 shadow-panel lg:order-2">
          <div className="relative min-h-[360px] flex-1 px-2 pb-2 pt-12 sm:min-h-[480px]">
            <ReplayCanvas data={data} outline={outline} clockRef={clockRef} gps={gpsRef} focus={focus} speakingRef={radio.speakingRef} />

            {/* Lap counter */}
            <div className="pointer-events-none absolute left-4 top-3">
              <p className="eyebrow">{preStart ? "Formation" : "Lap"}</p>
              <p className="timing text-3xl font-bold leading-none text-carbon-100">
                {Math.min(lap, tl.totalLaps)}
                <span className="text-lg text-carbon-500">/{tl.totalLaps}</span>
              </p>
              <p className="timing mt-1 text-micro text-carbon-400">T+{clock(ui.t - tl.raceStart)}</p>
            </div>

            {/* Source chip — honest about what's drawn right now */}
            <div className="pointer-events-none absolute right-4 top-3 flex flex-col items-end gap-1">
              <span
                className={`timing flex items-center gap-1.5 rounded-row border px-2 py-0.5 text-micro font-bold uppercase tracking-wider transition-colors duration-layout
                  ${gpsLive ? "border-sector-green/50 text-sector-green" : "border-carbon-600 text-carbon-400"}`}
                title={
                  gpsLive
                    ? "Cars are drawn from real GPS"
                    : "Cars are placed from lap timing on the circuit's speed profile. Slow to 5x or below for real GPS."
                }
              >
                <span className={`h-1.5 w-1.5 rounded-full ${gpsLive ? "animate-pulse-dot bg-sector-green" : "bg-carbon-500"}`} />
                {gpsLive ? "GPS" : "Timing"}
              </span>
              {focus != null && (
                <button
                  type="button"
                  onClick={() => setFocus(null)}
                  className="pointer-events-auto timing rounded-row border border-carbon-600 bg-carbon-950/80 px-2 py-0.5 text-micro font-bold uppercase tracking-wider text-carbon-300 hover:text-carbon-100"
                >
                  {data.drivers[focus]?.code} · clear
                </button>
              )}
            </div>

            {/* Track status banner */}
            <AnimatePresence>
              {status && (
                <motion.div
                  key={status.type + status.from}
                  className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2"
                  initial={{ y: -40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -40, opacity: 0, transition: { duration: 0.25, ease: EASE.in } }}
                  transition={{ duration: 0.45, ease: EASE.out }}
                >
                  <span
                    className={`block -skew-x-12 px-4 py-1 font-display text-sm font-black uppercase italic tracking-wider shadow-panel ${STATUS_BANNER[status.type].cls}`}
                  >
                    <span className="block skew-x-12">{STATUS_BANNER[status.type].label}</span>
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Team radio: now playing, or the browser's first-play block */}
            <AnimatePresence>
              {(radio.current || radio.blocked) && (
                <motion.div
                  key={radio.blocked ? "blocked" : radio.current!.url}
                  className="absolute bottom-4 right-4 flex items-stretch overflow-hidden shadow-panel"
                  initial={{ clipPath: "inset(0 0 0 100%)" }}
                  animate={{ clipPath: "inset(0 0 0 0%)" }}
                  exit={{ clipPath: "inset(0 100% 0 0)", transition: { duration: 0.25, ease: EASE.in } }}
                  transition={{ duration: 0.45, ease: EASE.out }}
                >
                  {radio.blocked ? (
                    <button
                      type="button"
                      onClick={radio.unblock}
                      className="timing flex items-center gap-2 border border-carbon-600 bg-carbon-950/95 px-3 py-2 text-micro font-bold uppercase tracking-wider text-carbon-300 transition-colors duration-micro hover:text-carbon-100"
                    >
                      <Volume2 size={13} /> Browser muted radio · tap to hear it
                    </button>
                  ) : (
                    <>
                      <span className="w-1" style={{ background: data.drivers[radio.current!.num]?.teamColor }} />
                      <span className="flex items-center gap-3 bg-carbon-950/95 py-1.5 pl-3 pr-2">
                        <span>
                          <span className="eyebrow block">Team radio</span>
                          <span className="font-display text-base font-bold uppercase tracking-wide text-carbon-100">
                            {data.drivers[radio.current!.num]?.name ?? data.drivers[radio.current!.num]?.code}
                          </span>
                        </span>
                        <RadioBars color={data.drivers[radio.current!.num]?.teamColor} />
                        <button
                          type="button"
                          onClick={radio.stop}
                          aria-label="Stop team radio"
                          className="grid h-7 w-7 place-items-center rounded-row border border-carbon-700 text-carbon-300 transition-colors duration-micro hover:border-carbon-600 hover:text-carbon-100"
                        >
                          <Square size={10} fill="currentColor" />
                        </button>
                      </span>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* After the flag: an invitation to hear from the podium. Waits
                for the chequered lower third to clear so they don't stack. */}
            <AnimatePresence>
              {chequeredAt != null &&
                ui.t >= chequeredAt &&
                !lowerThird &&
                interviews?.status === "ok" &&
                panel !== "interviews" &&
                !promptDismissed && (
                  <motion.div
                    key="podium-prompt"
                    className="absolute bottom-4 left-4 flex items-stretch overflow-hidden shadow-panel"
                    initial={{ clipPath: "inset(0 100% 0 0)" }}
                    animate={{ clipPath: "inset(0 0% 0 0)" }}
                    exit={{ clipPath: "inset(0 0 0 100%)", transition: { duration: 0.3, ease: EASE.in } }}
                    transition={{ duration: 0.5, ease: EASE.out }}
                  >
                    <span className="w-1 bg-sector-yellow" />
                    <button
                      type="button"
                      onClick={() => {
                        setPanel("interviews");
                        /* On phones the panel is below the map. */
                        document.getElementById("replay-side")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }}
                      className="group flex items-center gap-3 bg-carbon-950/95 py-1.5 pl-3 pr-3 text-left"
                    >
                      <span>
                        <span className="eyebrow block text-sector-yellow">After the flag</span>
                        <span className="font-display text-base font-bold uppercase tracking-wide text-carbon-100">Hear from the podium</span>
                      </span>
                      <ChevronsRight size={16} className="text-carbon-400 transition-transform duration-micro group-hover:translate-x-0.5 group-hover:text-carbon-100" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromptDismissed(true)}
                      aria-label="Dismiss"
                      className="bg-carbon-950/95 px-2 text-carbon-500 transition-colors duration-micro hover:text-carbon-100"
                    >
                      ×
                    </button>
                  </motion.div>
                )}
            </AnimatePresence>

            {/* Lower third */}
            <AnimatePresence>
              {lowerThird && (
                <motion.div
                  key={lowerThird.key}
                  className="pointer-events-none absolute bottom-4 left-4 flex items-stretch overflow-hidden shadow-panel"
                  initial={{ clipPath: "inset(0 100% 0 0)" }}
                  animate={{ clipPath: "inset(0 0% 0 0)" }}
                  exit={{ clipPath: "inset(0 0 0 100%)", transition: { duration: 0.3, ease: EASE.in } }}
                  transition={{ duration: 0.5, ease: EASE.out }}
                >
                  <span className="w-1" style={{ background: EVENT_COLOR[lowerThird.type] }} />
                  <span className="bg-carbon-950/95 px-3 py-1.5">
                    <span className="eyebrow block" style={{ color: EVENT_COLOR[lowerThird.type] }}>
                      Lap {lowerThird.lap}
                    </span>
                    <span className="font-display text-base font-bold uppercase tracking-wide text-carbon-100">{lowerThird.label}</span>
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Controls + timeline */}
          <div className="border-t border-carbon-700 bg-carbon-850 px-3 pb-1 pt-2">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <motion.button
                type="button"
                whileTap={PRESS}
                transition={SPRING.press}
                onClick={togglePlay}
                aria-label={ui.playing ? "Pause (space)" : "Play (space)"}
                className="grid h-9 w-9 place-items-center rounded-row bg-f1red text-white transition-colors duration-micro hover:bg-f1red-bright"
              >
                {ui.playing ? <Pause size={16} /> : <Play size={16} className="translate-x-px" />}
              </motion.button>
              {[
                { icon: ChevronsLeft, label: "Previous lap (←)", on: () => stepLap(-1) },
                { icon: SkipBack, label: "Previous event (,)", on: () => stepEvent(-1) },
                { icon: SkipForward, label: "Next event (.)", on: () => stepEvent(1) },
                { icon: ChevronsRight, label: "Next lap (→)", on: () => stepLap(1) },
              ].map(({ icon: Icon, label, on }) => (
                <motion.button
                  key={label}
                  type="button"
                  whileTap={PRESS}
                  transition={SPRING.press}
                  onClick={on}
                  aria-label={label}
                  title={label}
                  className="grid h-9 w-8 place-items-center rounded-row border border-carbon-700 text-carbon-300 transition-colors duration-micro hover:border-carbon-600 hover:text-carbon-100"
                >
                  <Icon size={15} />
                </motion.button>
              ))}

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAutoRadio((v) => !v);
                    if (autoRadio) radio.stop();
                  }}
                  aria-pressed={autoRadio}
                  title={`Play team radio as it happens (at ${RADIO_MAX_SPEED}× and slower)`}
                  className={`timing flex h-8 items-center gap-1.5 rounded-row border px-2 text-micro font-bold uppercase tracking-wider transition-colors duration-micro
                    ${autoRadio ? "border-carbon-600 text-carbon-100" : "border-carbon-700 text-carbon-500 hover:text-carbon-300"}`}
                >
                  {autoRadio ? <Volume2 size={13} /> : <VolumeX size={13} />}
                  Radio
                </button>
                <div className="flex rounded-row border border-carbon-700 bg-carbon-900 p-0.5" role="group" aria-label="Playback speed (↑/↓)">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSpeed(s)}
                      aria-pressed={ui.speed === s}
                      title={s <= GPS_MAX_SPEED ? "Real GPS at this speed" : "Lap-timing placement at this speed"}
                      className={`timing relative px-2 py-1 text-micro font-bold transition-colors duration-micro
                        ${ui.speed === s ? "text-white" : s <= GPS_MAX_SPEED ? "text-carbon-300 hover:text-carbon-100" : "text-carbon-400 hover:text-carbon-100"}`}
                    >
                      {ui.speed === s && (
                        <motion.span layoutId="replay-speed" transition={SPRING.panel} className="absolute inset-0 rounded-[3px] bg-carbon-600" />
                      )}
                      <span className="relative">{s}×</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <ReplayTimeline data={data} t={ui.t} from={tMin} to={tMax} onSeek={seek} onRadio={playRadio} playingUrl={radio.current?.url ?? null} />
          </div>
        </section>

        {/* Side panel: race feed / podium interviews */}
        <section
          id="replay-side"
          className="order-3 flex min-h-0 flex-col rounded-panel border border-carbon-700 bg-carbon-850 p-2 shadow-panel max-lg:h-[520px]"
        >
          <div className="mb-2 grid shrink-0 grid-cols-2 border-b border-carbon-700" role="tablist">
            {(
              [
                ["feed", "Race feed"],
                ["interviews", "Interviews"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={panel === key}
                onClick={() => setPanel(key)}
                className={`timing relative pb-1.5 text-micro font-bold uppercase tracking-wider transition-colors duration-micro
                  ${panel === key ? "text-carbon-100" : "text-carbon-400 hover:text-carbon-100"}`}
              >
                {label}
                {key === "interviews" && interviews?.status === "ok" && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-sector-yellow align-middle" aria-label="available" />
                )}
                {panel === key && (
                  <motion.span layoutId="replay-side-tab" transition={SPRING.panel} className="absolute inset-x-0 -bottom-px h-[2px] bg-f1red" />
                )}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {panel === "feed" ? (
              <EventFeed data={data} t={ui.t} onJump={jumpTo} playingUrl={radio.current?.url ?? null} />
            ) : (
              <Interviews data={data} interviews={interviews} />
            )}
          </div>
        </section>
      </div>

      <p className="timing mt-3 text-micro leading-relaxed text-carbon-400">
        Space play/pause · ←/→ lap · ,/. event · ↑/↓ speed · click a driver to follow. Positions come from lap timing
        mapped onto the circuit&apos;s real speed profile; at {GPS_MAX_SPEED}× and slower, cars switch to live GPS. Team
        radio plays as it happens at {RADIO_MAX_SPEED}× and slower.
      </p>
    </div>
  );
}

/** Four bars bouncing out of phase — "someone is talking", not a real level meter. */
function RadioBars({ color }: { color?: string }) {
  return (
    <span className="flex h-4 items-end gap-[2px]" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <motion.span
          key={i}
          className="w-[3px]"
          style={{ background: color ?? "#E7EAF0" }}
          animate={{ height: ["30%", "100%", "45%", "85%", "30%"] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: i * 0.13 }}
        />
      ))}
    </span>
  );
}
