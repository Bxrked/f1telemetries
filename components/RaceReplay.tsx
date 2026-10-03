"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Play, Pause, SkipBack, SkipForward, ChevronsLeft, ChevronsRight, Volume2, VolumeX, Square, PanelRightClose, PanelRightOpen } from "lucide-react";
import { getReplayTimeline, getReplayGpsWindow, getTrackOutline, getPostRaceInterviews } from "@/services/f1Service";
import { createGpsBuffer, floorIndex } from "@/services/replayModel";
import { EASE, SPRING, PRESS } from "@/lib/motion";
import { useForceVisible } from "./MotionProvider";
import { GridIntro, DriverCard, Moment, PodiumFinish, CardStats } from "./replay/ReplayStage";
import ReplayCanvas, { ReplayClock } from "./replay/ReplayCanvas";
import ReplayTimeline from "./replay/ReplayTimeline";
import TimingTower from "./replay/TimingTower";
import EventFeed from "./replay/EventFeed";
import Interviews from "./replay/Interviews";
import { useTeamRadio, RadioClip } from "./replay/useTeamRadio";

/* three.js (~600 kB) only downloads for people who switch to 3D. */
const Replay3D = dynamic(() => import("./replay/Replay3D"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center">
      <p className="timing text-micro uppercase tracking-[0.22em] text-carbon-500">Building 3D circuit…</p>
    </div>
  ),
});
const VIEW_KEY = "f1replay:view";

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
const LOWER_THIRD_TYPES = new Set(["fastest", "retired", "penalty", "chequered", "start", "overtake"]);
/* Overtakes get a moment only when you're watching closely: at 10× they
   would be a strobe (a busy race has dozens). */
const OVERTAKE_MOMENT_MAX_SPEED = 2;
const FEED_KEY = "f1replay:feed";

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
  /* 2D map or 3D circuit — remembered per browser, a convenience only. */
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [no3d, setNo3d] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "3d") setView("3d");
    } catch {
      /* storage blocked — 2D it is */
    }
  }, []);
  const chooseView = useCallback((v: "2d" | "3d") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* fine */
    }
  }, []);
  const on3dUnsupported = useCallback(() => {
    setNo3d(true);
    setView("2d");
  }, []);
  const [lowerThird, setLowerThird] = useState<any>(null);
  const [panel, setPanel] = useState<"feed" | "interviews">("feed");
  const [interviews, setInterviews] = useState<any>(null);
  const [promptDismissed, setPromptDismissed] = useState(false);
  /* When the podium is due — read by seek() to re-arm it. */
  const podiumAtRef = useRef<number | null>(null);
  /* The start: "lights" while the front row and the five reds are up. */
  const [intro, setIntro] = useState<"pending" | "lights" | "done">("pending");
  const introRef = useRef(intro);
  introRef.current = intro;
  const reducedMotion = useReducedMotion();
  const forceVisible = useForceVisible();
  const startRace = useCallback(() => {
    if (introRef.current === "done") return;
    introRef.current = "done";
    setIntro("done");
    clockRef.current.playing = true;
    setUi((u) => ({ ...u, playing: true }));
  }, []);
  /* Front row: grid slots 1 and 2, as people. Null if either is unknown
     (no grid in the results, or a driver the identity feed doesn't have). */
  const frontRow = useMemo(() => {
    if (!data) return null;
    const at = (slot: number) => Object.entries(data.results ?? {}).find(([, r]: any) => r.grid === slot)?.[0];
    const [a, b] = [at(1), at(2)].map((n) => (n != null ? data.drivers[+n] : null));
    return a?.code && b?.code ? ([a, b] as [any, any]) : null;
  }, [data]);
  /* The start sequence needs motion and a front row. Without either the
     race still has to begin: a beat on the grid, then go. (Gating only
     on reduced motion left a replay with no front row waiting forever.) */
  const showIntro = intro === "lights" && !!frontRow && !reducedMotion && !forceVisible;
  useEffect(() => {
    if (intro !== "lights" || showIntro) return;
    const timer = setTimeout(startRace, 900);
    return () => clearTimeout(timer);
  }, [intro, showIntro, startRace]);
  /* Race feed panel — collapsible on desktop, remembered per browser. */
  const [feedOpen, setFeedOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(FEED_KEY) === "closed") setFeedOpen(false);
    } catch {
      /* storage blocked — open it is */
    }
  }, []);
  const showFeed = useCallback((open: boolean) => {
    setFeedOpen(open);
    try {
      localStorage.setItem(FEED_KEY, open ? "open" : "closed");
    } catch {
      /* fine */
    }
  }, []);
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
        /* The front row and the start lights; the clock starts when
           they go out (startRace). */
        setIntro("lights");
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
        if (i >= 0 && lowerTimes[i] > prev && (lowerTypes[i].type !== "overtake" || c.speed <= OVERTAKE_MOMENT_MAX_SPEED)) {
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
      /* Going back before the finish re-arms the podium. */
      if (podiumAtRef.current != null && t < podiumAtRef.current) setPromptDismissed(false);
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
      /* Any key skips the start sequence. */
      if (introRef.current === "lights") {
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          startRace();
        }
        return;
      }
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
  }, [data, togglePlay, stepLap, stepEvent, setSpeed, startRace]);

  /* ---- Derived UI state (sampled at UI_HZ) ---- */
  const cars = useMemo(() => (tl ? tl.snapshot(ui.t) : []), [tl, ui.t]);
  const gaps = useMemo(() => (tl ? tl.gaps(cars, ui.t) : []), [tl, cars, ui.t]);
  const lap = tl ? tl.lapAt(ui.t) : 1;
  const status = data?.status.find((s: any) => ui.t >= s.from && ui.t <= s.to) ?? null;
  const preStart = tl && ui.t < tl.raceStart;
  const chequeredAt = data?.events.find((e: any) => e.type === "chequered")?.t ?? null;

  if (failed) {
    return (
      <div className="grid min-h-[60svh] place-items-center px-6 text-center lg:absolute lg:inset-0">
        <div>
          <p className="timing text-label font-bold uppercase tracking-wider text-carbon-300">Replay unavailable</p>
          <p className="mx-auto mt-2 max-w-md text-data leading-relaxed text-carbon-400">
            The replay is built from live timing and GPS for the latest race, and that data couldn&apos;t be loaded
            right now. It usually appears about 30 minutes after a race finishes.
          </p>
        </div>
      </div>
    );
  }

  if (!data || !outline) {
    return (
      <div className="grid min-h-[60svh] place-items-center lg:absolute lg:inset-0">
        <span className="timing flex items-center gap-2 text-micro uppercase tracking-[0.22em] text-carbon-500">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-f1red-bright" />
          Building race timeline
        </span>
      </div>
    );
  }

  const drv = (n: number) => data.drivers[n] ?? {};

  /* Podium: the classified top three, shown once all three have taken the flag. */
  const podiumNums = Object.entries(data.results)
    .filter(([, r]: any) => r.finished && r.finish >= 1 && r.finish <= 3)
    .sort(([, a]: any, [, b]: any) => a.finish - b.finish)
    .map(([n]) => +n);
  const podiumAt = podiumNums.length
    ? Math.max(...podiumNums.map((n) => tl.doneAt?.[n] ?? chequeredAt ?? tl.raceEnd))
    : null;
  podiumAtRef.current = podiumAt;
  const showPodium = podiumAt != null && ui.t >= podiumAt && !promptDismissed && !!drv(podiumNums[0]).code;

  /* The followed driver's race, right now. */
  const focusIdx = focus != null ? cars.findIndex((c: any) => c.num === focus) : -1;
  const focusCar = focusIdx >= 0 ? cars[focusIdx] : null;
  let card: CardStats | null = null;
  if (focusCar) {
    const g = gaps.find((x: any) => x.num === focus);
    const list = data.stints[focus!] ?? [];
    const stint = list.find((x: any) => (x.from ?? 0) <= focusCar.lap && focusCar.lap <= (x.to ?? Infinity)) ?? list[list.length - 1];
    const sec = (v: number | null | undefined) => (v == null ? "—" : `+${v.toFixed(v >= 100 ? 0 : 1)}s`);
    const laps = (n: number) => `+${n} lap${n > 1 ? "s" : ""}`;
    const out = focusCar.state === "retired";
    const waiting = focusCar.state === "grid";
    card = {
      position: out ? "Out" : focusCar.state === "finished" ? `Finished P${focusIdx + 1}` : `P${focusIdx + 1}`,
      ahead: out || waiting ? "—" : focusIdx === 0 ? "Leading" : g?.lapsToAhead >= 1 ? laps(g.lapsToAhead) : sec(g?.interval),
      aheadNote: !out && focusIdx > 0 ? drv(cars[focusIdx - 1].num).code : undefined,
      leader: out || waiting || focusIdx === 0 ? "—" : g?.lapsDown >= 1 ? laps(g.lapsDown) : sec(g?.gap),
      compound: stint?.compound ?? null,
      tyreAge: stint ? Math.max(1, focusCar.lap - (stint.from ?? focusCar.lap) + 1) : null,
      stops: data.pits.filter((p: any) => p.num === focus && p.t <= ui.t).length,
      grid: data.results[focus!]?.grid || null,
    };
  }

  /* The right-hand column is on stage while it has something to show. */
  const rightOpen = feedOpen || !!(focusCar && card);

  return (
    /* One stage, no boxes. From lg up it fills what the nav leaves and
       nothing scrolls: tower left, map in the middle, feed right, the
       timeline docked along the bottom. Below lg the same pieces stack
       (map, controls, tower, feed) and the page scrolls. */
    <div className="relative flex min-h-0 flex-col lg:absolute lg:inset-0">
      <div className="max-lg:contents lg:relative lg:min-h-0 lg:flex-1 lg:overflow-hidden">
        {/* ── Top line: what and where in the race ──────────────────── */}
        <header className="order-1 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 lg:absolute lg:inset-x-0 lg:top-0 lg:z-20 lg:h-14 lg:flex-nowrap lg:py-0">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-f1red-bright" />
              Race replay · every lap
            </p>
            <h1 className="mt-0.5 truncate font-display text-xl font-black uppercase italic leading-none tracking-tight" aria-label={data.raceName}>
              {String(data.raceName).split(" ").map((w: string, i: number) => (
                <span key={i} className={/^grand$|^prix$/i.test(w) ? "text-carbon-400" : "text-carbon-100"}>
                  {w}{" "}
                </span>
              ))}
            </h1>
          </div>
          <div className="flex items-baseline gap-2 lg:border-l lg:border-carbon-800 lg:pl-6">
            <span className="eyebrow">{preStart ? "Formation" : "Lap"}</span>
            <span className="timing text-2xl font-bold leading-none text-carbon-100">
              {Math.min(lap, tl.totalLaps)}
              <span className="text-base text-carbon-500">/{tl.totalLaps}</span>
            </span>
            <span className="timing text-micro text-carbon-400">T+{clock(ui.t - tl.raceStart)}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Honest about what's drawn right now (2D only: 3D always places by timing). */}
            {view === "2d" && (
              <span
                className={`timing flex h-7 items-center gap-1.5 rounded-row border px-2 text-micro font-bold uppercase tracking-wider transition-colors duration-layout
                  ${gpsLive ? "border-sector-green/50 text-sector-green" : "border-carbon-700 text-carbon-400"}`}
                title={
                  gpsLive
                    ? "Cars are drawn from real GPS"
                    : `Cars are placed from lap timing on the circuit's speed profile. Slow to ${GPS_MAX_SPEED}x or below for real GPS.`
                }
              >
                <span className={`h-1.5 w-1.5 rounded-full ${gpsLive ? "animate-pulse-dot bg-sector-green" : "bg-carbon-500"}`} />
                {gpsLive ? "GPS" : "Timing"}
              </span>
            )}
            {!no3d && (
              <div className="flex h-7 rounded-row border border-carbon-700 p-0.5" role="group" aria-label="Map view">
                {(["2d", "3d"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => chooseView(v)}
                    aria-pressed={view === v}
                    className={`timing relative z-10 px-2.5 text-micro font-bold uppercase tracking-wider transition-colors duration-micro
                      ${view === v ? "text-white" : "text-carbon-400 hover:text-carbon-100"}`}
                  >
                    {view === v && <motion.span layoutId="replay-view" className="absolute inset-0 -z-10 rounded-[3px] bg-f1red" transition={SPRING.panel} />}
                    {v}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => showFeed(!feedOpen)}
              aria-pressed={feedOpen}
              title={feedOpen ? "Hide the race feed" : "Show the race feed"}
              className={`timing hidden h-7 items-center gap-1.5 rounded-row border px-2 text-micro font-bold uppercase tracking-wider transition-colors duration-micro lg:flex
                ${feedOpen ? "border-carbon-600 text-carbon-100" : "border-carbon-700 text-carbon-400 hover:text-carbon-100"}`}
            >
              {feedOpen ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
              Feed
            </button>
          </div>
        </header>

        {/* ── The moment: a notable event, in the site's own type. In the
               empty middle of the header line, above the map — over the
               map it sat on top of the cars it was describing. ───────── */}
        <AnimatePresence>
          {lowerThird && (
            <div
              key={lowerThird.key}
              className={`pointer-events-none absolute left-[248px] top-0 z-20 hidden h-14 lg:block ${rightOpen ? "right-[300px]" : "right-0"}`}
            >
              <Moment event={lowerThird} color={lowerThird.nums?.length ? drv(lowerThird.nums[0]).teamColor : undefined} compact />
            </div>
          )}
        </AnimatePresence>

        {/* ── Timing tower ──────────────────────────────────────────── */}
        <section className="order-5 flex min-h-0 flex-col px-3 py-3 max-lg:h-[440px] max-lg:border-t max-lg:border-carbon-800 lg:absolute lg:bottom-0 lg:left-0 lg:top-14 lg:z-10 lg:w-[248px] lg:py-1 lg:pl-4 lg:pr-2">
          <TimingTower data={data} cars={cars} gaps={gaps} lap={lap} t={ui.t} focus={focus} onFocus={setFocus} speaking={radio.current?.num ?? null} />
        </section>

        {/* ── The map ───────────────────────────────────────────────── */}
        <section
          className={`relative order-2 h-[54svh] min-h-[360px] overflow-hidden lg:absolute lg:bottom-0 lg:left-[248px] lg:top-14 lg:h-auto lg:min-h-0
            ${rightOpen ? "lg:right-[300px]" : "lg:right-0"}`}
        >
          <div className={`absolute inset-0 ${view === "2d" ? "px-3 pb-3 pt-12" : ""}`}>
            {view === "3d" ? (
              <Replay3D
                data={data}
                clockRef={clockRef}
                focus={focus}
                onFocus={setFocus}
                speakingRef={radio.speakingRef}
                onUnsupported={on3dUnsupported}
              />
            ) : (
              <ReplayCanvas data={data} outline={outline} clockRef={clockRef} gps={gpsRef} focus={focus} speakingRef={radio.speakingRef} />
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


          {/* The moment, on phones: over the top of the map (from lg up it
              sits in the header line instead, clear of the track). */}
          <AnimatePresence>
            {lowerThird && !showPodium && (
              <div key={lowerThird.key} className="absolute inset-x-0 top-10 lg:hidden">
                <Moment event={lowerThird} color={lowerThird.nums?.length ? drv(lowerThird.nums[0]).teamColor : undefined} />
              </div>
            )}
          </AnimatePresence>

          {/* Foot of the map: who's on the radio. (The followed driver's
              card lives in the right-hand column — over the map it hid
              the cars in that corner.) */}
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-end">
            {/* Team radio: now playing, or the browser's first-play block */}
            <AnimatePresence>
              {(radio.current || radio.blocked) && (
                <motion.div
                  key={radio.blocked ? "blocked" : radio.current!.url}
                  className="pointer-events-auto flex items-stretch self-end overflow-hidden lg:ml-auto"
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

          </div>

          {/* After the flag: the podium, and the way into the interviews. */}
          <AnimatePresence>
            {showPodium && (
              <PodiumFinish
                key="podium"
                data={data}
                podium={podiumNums.map((n) => ({ number: n, ...drv(n) }))}
                canInterview={interviews?.status === "ok"}
                onInterviews={() => {
                  setPanel("interviews");
                  showFeed(true);
                  setPromptDismissed(true);
                  /* On phones the panel is below the map. */
                  document.getElementById("replay-side")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }}
                onAgain={() => {
                  seek(tMin);
                  clockRef.current.speed = 10;
                  clockRef.current.playing = true;
                  sync();
                }}
                onClose={() => setPromptDismissed(true)}
              />
            )}
          </AnimatePresence>
        </section>

        {/* ── Right column: who you're following, then the race feed ────
               It slides off the stage when it has nothing to show (feed
               collapsed, nobody followed). The feed stays mounted when
               collapsed, so reopening is instant and it keeps its place.
               Below lg its two parts simply stack in the page. */}
        <div
          className={`max-lg:contents lg:absolute lg:bottom-0 lg:right-0 lg:top-14 lg:z-10 lg:flex lg:w-[300px] lg:flex-col lg:border-l lg:border-carbon-800 lg:bg-black
            lg:transition-transform lg:duration-layout lg:ease-out-expo ${rightOpen ? "lg:translate-x-0" : "lg:pointer-events-none lg:translate-x-full"}`}
        >
          <AnimatePresence initial={false}>
            {focusCar && card && (
              <DriverCard key="card" driver={{ number: focus, ...drv(focus!) }} stats={card} onClose={() => setFocus(null)} className="order-3" />
            )}
          </AnimatePresence>
        <section
          id="replay-side"
          aria-hidden={!feedOpen || undefined}
          className={`order-6 flex min-h-0 flex-col px-3 py-3 max-lg:h-[520px] max-lg:border-t max-lg:border-carbon-800 lg:flex-1 lg:py-1 lg:pl-3 lg:pr-4
            ${feedOpen ? "" : "lg:hidden"}`}
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
      </div>

      {/* ── Dock: controls and the race timeline ─────────────────────── */}
      <div className="order-4 shrink-0 border-t border-carbon-800 bg-black px-3 pb-1 pt-2 sm:px-4">
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
            <span
              className="timing hidden text-micro text-carbon-500 xl:inline"
              title="Space play/pause · ←/→ lap · ,/. event · ↑/↓ speed · Esc stop following"
            >
              Space · ← → · , .
            </span>
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

      {/* ── The start: front row and the lights ──────────────────────── */}
      <AnimatePresence>
        {showIntro && frontRow && <GridIntro key="grid" data={data} front={frontRow} onGo={startRace} />}
      </AnimatePresence>
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
