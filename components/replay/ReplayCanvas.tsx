"use client";

import { MutableRefObject, useEffect, useMemo, useRef } from "react";
import { projectToTrack } from "@/services/f1Service";
import { floorIndex, pointAtDist, refDistAt } from "@/services/replayModel";

export type ReplayClock = { t: number; speed: number; playing: boolean };

/* The track is drawn in the outline's viewBox units, so it scales with
   the circuit. Car badges are sized in SCREEN pixels instead: they carry
   text, and text has to stay readable however small the map gets. */
const TRACK_W = 13;
const BADGE_R = 11; // px; 3-letter code sits inside
const BADGE_R_SMALL = 8.5; // px, narrow maps (phones)
const GPS_BLEND_MS = 350; // lap-mode → GPS crossfade, real time
const PULSE_MS = 1100;

const STATUS_STROKE: Record<string, string> = { sc: "#FFD644", vsc: "#FFD644", red: "#FF1E00" };

/**
 * The replay map. Draws straight to a canvas on every animation frame,
 * reading the playback clock from a ref — React never re-renders for
 * motion, which is what let the old SVG version stutter.
 *
 * Car placement per frame:
 *   lap-mode position (always available)  ⟶ blended toward GPS when the
 *   GPS buffer has the car at that instant. The blend runs over ~350 ms
 *   of real time in both directions, so a car never jumps when GPS
 *   arrives, and never vanishes when a chunk is late.
 */
export default function ReplayCanvas({
  data,
  outline,
  clockRef,
  gps,
  focus,
  speakingRef,
}: {
  data: any;
  outline: any;
  clockRef: MutableRefObject<ReplayClock>;
  gps: MutableRefObject<{ sampleAt: (num: number, t: number) => number[] | null } | null>;
  focus: number | null;
  /** Car whose team radio is playing — read every frame, no re-render. */
  speakingRef: MutableRefObject<number | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const focusRef = useRef(focus);
  focusRef.current = focus;

  const tf = outline.transform;
  const { W, H } = outline.viewBox;

  /* Track geometry, built once — from the SAME smoothed racing line the
     cars follow, so they sit on the drawn track through every corner. */
  const geo = useMemo(() => {
    const ref = data.reference;
    const STEP = ref.total / 1500;
    const trace = (from: number, to: number) => {
      const p = new Path2D();
      for (let dd = from, first = true; dd <= to + 1e-6; dd += STEP, first = false) {
        const [wx, wy] = pointAtDist(ref, Math.min(dd, to));
        const [sx, sy] = projectToTrack(tf, wx, wy);
        if (first) p.moveTo(sx, sy); else p.lineTo(sx, sy);
      }
      return p;
    };
    const path = trace(0, ref.total);
    path.closePath();
    const b = ref.sectorBounds.length === 4 ? ref.sectorBounds.map((ms: number) => refDistAt(ref, ms)) : [0, ref.total / 3, (2 * ref.total) / 3, ref.total];
    const sectorPaths = [0, 1, 2].map((i) => trace(b[i], b[i + 1]));
    /* Start/finish: a short tick across the track at the reference's line. */
    const [ax, ay] = pointAtDist(ref, 0);
    const [bx, by] = pointAtDist(ref, ref.total * 0.004);
    const a = projectToTrack(tf, ax, ay);
    const b2 = projectToTrack(tf, bx, by);
    const ang = Math.atan2(b2[1] - a[1], b2[0] - a[0]) + Math.PI / 2;
    return { path, sectorPaths, line: { x: a[0], y: a[1], ang } };
  }, [outline, data, tf]);

  /* Overtakes are the only events drawn on the map (as a pulse at the
     passing car); everything else lives in the banner and the feed. */
  const passes = useMemo(() => data.events.filter((e: any) => e.type === "overtake"), [data]);
  const passTimes = useMemo(() => passes.map((e: any) => e.t), [passes]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const font = getComputedStyle(document.body).getPropertyValue("--font-timing").trim() || "monospace";
    const blend = new Map<number, number>();
    const pulses: { num: number; born: number }[] = [];
    let prevT = clockRef.current.t;
    let lastReal = performance.now();
    let raf = 0;
    let view = { s: 1, ox: 0, oy: 0, dpr: 1, w: 1 };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      const s = Math.min(r.width / W, r.height / H);
      view = { s, ox: (r.width - W * s) / 2, oy: (r.height - H * s) / 2, dpr, w: r.width };
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const frame = (now: number) => {
      const dtReal = Math.min(100, now - lastReal);
      lastReal = now;
      const { t } = clockRef.current;
      const tl = data.timeline;

      /* New overtakes crossed since last frame spawn a pulse — but not on
         a seek, which would fire every pass it jumped over. */
      if (t > prevT && t - prevT < 60_000) {
        let i = floorIndex(passTimes, prevT) + 1;
        for (; i < passes.length && passes[i].t <= t; i++) pulses.push({ num: passes[i].nums[0], born: now });
      }
      prevT = t;

      const { s, ox, oy, dpr } = view;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      /* ---- Track, tinted by status ---- */
      const status = data.status.find((p: any) => t >= p.from && t <= p.to);
      ctx.strokeStyle = "#161A22";
      ctx.lineWidth = TRACK_W;
      ctx.stroke(geo.path);
      ctx.strokeStyle = "#232A37";
      ctx.lineWidth = TRACK_W - 5;
      ctx.stroke(geo.path);
      if (status) {
        const pulse = 0.55 + 0.35 * Math.sin(now / 260);
        ctx.save();
        ctx.globalAlpha = status.type === "red" ? 0.9 : pulse;
        ctx.strokeStyle = STATUS_STROKE[status.type];
        ctx.lineWidth = 2.4;
        if (status.type === "vsc") ctx.setLineDash([7, 6]);
        ctx.shadowColor = STATUS_STROKE[status.type];
        ctx.shadowBlur = 10;
        ctx.stroke(geo.path);
        ctx.restore();
      } else {
        /* Green running: faint sector colouring as a reading aid. */
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.lineWidth = 1.4;
        ["#E10600", "#3B9BFF", "#FFD644"].forEach((c, i) => {
          ctx.strokeStyle = c;
          ctx.stroke(geo.sectorPaths[i]);
        });
        ctx.restore();
      }

      /* Start / finish line */
      ctx.save();
      ctx.translate(geo.line.x, geo.line.y);
      ctx.rotate(geo.line.ang);
      ctx.strokeStyle = "#E7EAF0";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-TRACK_W * 0.7, 0);
      ctx.lineTo(TRACK_W * 0.7, 0);
      ctx.stroke();
      ctx.restore();

      /* ---- Cars ---- */
      const cars = tl.snapshot(t);
      const focusNum = focusRef.current;
      const drawn: { num: number; x: number; y: number; pos: number; alpha: number }[] = [];
      cars.forEach((c: any, i: number) => {
        if (c.state === "retired") return;
        if (c.state === "finished" && t - c.at > 90_000) return;
        let [x, y] = projectToTrack(tf, c.x, c.y);
        const g = c.state === "racing" ? gps.current?.sampleAt(c.num, t) : null;
        const cur = blend.get(c.num) ?? 0;
        const next = Math.max(0, Math.min(1, cur + (g ? 1 : -1) * (dtReal / GPS_BLEND_MS)));
        blend.set(c.num, next);
        if (g && next > 0) {
          const [gx, gy] = projectToTrack(tf, g[0], g[1]);
          /* Smoothstep, so the handover eases in and out instead of
             starting and stopping on a linear ramp. */
          const e = next * next * (3 - 2 * next);
          x += (gx - x) * e;
          y += (gy - y) * e;
        }
        const alpha = c.state === "finished" ? 0.45 : c.inPit ? 0.4 : 1;
        drawn.push({ num: c.num, x, y, pos: i + 1, alpha });
      });

      /* ---- Badges, in screen space ---- */
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const R = view.w < 560 ? BADGE_R_SMALL : BADGE_R;
      const toScreen = (d: { x: number; y: number }) => [ox + d.x * s, oy + d.y * s];

      /* Overtake pulses, under the badges */
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        const age = (now - p.born) / PULSE_MS;
        if (age >= 1) { pulses.splice(i, 1); continue; }
        const d = drawn.find((c) => c.num === p.num);
        if (!d) continue;
        const [px, py] = toScreen(d);
        ctx.beginPath();
        ctx.arc(px, py, R + 2 + age * 20, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(46,224,124,${(1 - age) * 0.9})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      /* Team radio: sound rings rolling off the speaking car, in its team
         colour, drawn under the badge. */
      const speaker = drawn.find((c) => c.num === speakingRef.current);
      if (speaker) {
        const [px, py] = toScreen(speaker);
        const color = data.drivers[speaker.num]?.teamColor ?? "#E7EAF0";
        for (let k = 0; k < 2; k++) {
          const phase = ((now / 900 + k / 2) % 1);
          ctx.beginPath();
          ctx.arc(px, py, R + 2 + phase * 14, 0, Math.PI * 2);
          ctx.globalAlpha = (1 - phase) * 0.8;
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      /* Back markers first so the leaders sit on top; focus last of all. */
      const paintOrder = [...drawn].sort((a, b) => (a.num === focusNum ? 1 : b.num === focusNum ? -1 : b.pos - a.pos));
      ctx.font = `700 ${R < BADGE_R ? 7 : 9}px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const d of paintOrder) {
        const id = data.drivers[d.num] ?? {};
        const color = id.teamColor ?? "#8B95A7";
        const isFocus = d.num === focusNum;
        const dim = focusNum != null && !isFocus;
        const [px, py] = toScreen(d);
        ctx.globalAlpha = d.alpha * (dim ? 0.35 : 1);

        if (isFocus || d.pos === 1) {
          /* Focus: bold white ring. Leader: thin one. */
          ctx.beginPath();
          ctx.arc(px, py, R + (isFocus ? 3.5 : 2.5), 0, Math.PI * 2);
          ctx.strokeStyle = isFocus ? "#FFFFFF" : "rgba(231,234,240,0.8)";
          ctx.lineWidth = isFocus ? 2 : 1.2;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(px, py, R, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "#08090C";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = textOn(color);
        ctx.fillText(id.code ?? String(d.num), px, py + 0.5);
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [data, geo, passes, passTimes, tf, W, H, clockRef, gps, speakingRef]);

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full"
      role="img"
      aria-label={`${data.raceName} replay map`}
    />
  );
}

/** Dark text on light liveries (Haas, Mercedes, Alpine), white on the rest. */
const textCache = new Map<string, string>();
function textOn(hex: string) {
  let c = textCache.get(hex);
  if (c) return c;
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  /* Pick whichever of near-black / white has the higher contrast. */
  c = (L + 0.05) / (0.004 + 0.05) > 1.05 / (L + 0.05) ? "#08090C" : "#FFFFFF";
  textCache.set(hex, c);
  return c;
}
