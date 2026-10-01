"use client";

/**
 * The replay map in 3D — the same race as the 2D canvas, on the circuit's
 * real elevation (OpenF1 GPS height, at true scale — ELEVATION is the
 * multiplier, 1 = real; Baku climbs ~27 m over 6 km, so it's subtle).
 *
 * It owns no state of its own: it reads RaceReplay's playback clock, focus
 * and radio refs every frame, exactly like ReplayCanvas, so switching
 * 2D ⇄ 3D mid-race carries on from the same instant. Cars are placed in
 * lap mode (timing on the reference lap's speed profile); GPS isn't used
 * here.
 *
 * World → scene: 1 scene unit = 10 m. OpenF1 x/y/z are decimetres. Scene
 * y is up; world y is flipped onto scene -z so the layout matches 2D.
 *
 * Loaded on demand (next/dynamic, no SSR) — three.js only downloads for
 * people who switch to 3D.
 */

import { MutableRefObject, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { pointAtDist3 } from "@/services/replayModel";
import { createFleet } from "./buildCar";
import type { ReplayClock } from "./ReplayCanvas";

const UNIT = 100; // decimetres per scene unit (10 m)
const TRACK_W = 2.2; // scene units — wider than the real ~1.4 so it reads
const ELEVATION = 1;
/* Cars are drawn at 2× real size (metres → scene units ×0.1, then ×2):
   true scale is a speck from the overview camera. */
const CAR_SCALE = 0.2;
const EDGE = 0xc8ccd4;
const STATUS_EDGE: Record<string, number> = { sc: 0xffd644, vsc: 0xffd644, red: 0xff1e00 };

type Cam = "overview" | "low" | "chase";
const CAMS: { id: Cam; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "low", label: "Low" },
  { id: "chase", label: "Chase" },
];

export default function Replay3D({
  data,
  clockRef,
  focus,
  onFocus,
  speakingRef,
  onUnsupported,
}: {
  data: any;
  clockRef: MutableRefObject<ReplayClock>;
  focus: number | null;
  onFocus: (num: number | null) => void;
  speakingRef: MutableRefObject<number | null>;
  /** No WebGL here — the page falls back to 2D. */
  onUnsupported: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState<Cam>(focus != null ? "chase" : "overview");
  const camRef = useRef(cam);
  camRef.current = cam;
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

  /* Picking a driver (tower or map) chases them; clearing goes back up. */
  const prevFocus = useRef(focus);
  useEffect(() => {
    if (focus != null && focus !== prevFocus.current) setCam("chase");
    if (focus == null && prevFocus.current != null && camRef.current === "chase") setCam("overview");
    prevFocus.current = focus;
  }, [focus]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const ref = data.reference;
    const tl = data.timeline;
    if (!ref?.z) {
      onUnsupported();
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      onUnsupported();
      return;
    }

    /* ---- Frame of reference: centre the circuit, find the height range ---- */
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity;
    for (let i = 0; i < ref.n; i++) {
      minX = Math.min(minX, ref.x[i]); maxX = Math.max(maxX, ref.x[i]);
      minY = Math.min(minY, ref.y[i]); maxY = Math.max(maxY, ref.y[i]);
      minZ = Math.min(minZ, ref.z[i]);
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const span = Math.max(maxX - minX, maxY - minY) / UNIT;
    const toScene = (x: number, y: number, z: number, out = new THREE.Vector3()) =>
      out.set((x - cx) / UNIT, ((z - minZ) / UNIT) * ELEVATION, -(y - cy) / UNIT);

    /* ---- Renderer / scene / camera ---- */
    /* 1.5× rather than 2× on Retina: ~44 % fewer pixels to shade, and with
       MSAA on it still looks sharp. */
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
    renderer.setClearColor(0x0b0d12);
    renderer.domElement.style.display = "block";
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b0d12, span * 1.6, span * 4);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, span * 10);
    /* Overview distance that fits the circuit in the vertical field of
       view (with margin), looking down at ~50°. */
    const overviewDist = (span * 0.62) / Math.tan(THREE.MathUtils.degToRad(42 / 2));
    const overviewPos = () => new THREE.Vector3(0, overviewDist * 0.78, overviewDist * 0.62);
    camera.position.copy(overviewPos());
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.49;

    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a1214, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(span, span * 1.2, span * 0.4);
    scene.add(sun);
    const grid = new THREE.GridHelper(span * 3, 60, 0x1e2430, 0x141820);
    grid.position.y = -0.05;
    scene.add(grid);

    /* ---- Track ---- */
    const SAMPLES = 1600;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= SAMPLES; k++) {
      const [x, y, z] = pointAtDist3(ref, (k / SAMPLES) * ref.total);
      pts.push(toScene(x, y, z));
    }
    /* Ribbon: left/right edges perpendicular to the heading, in plan. */
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const b = ref.sectorBounds.length === 4 ? ref.sectorBounds.map((ms: number) => ms / ref.lapMs) : [0, 1 / 3, 2 / 3, 1];
    const sectorCol = [new THREE.Color(0x3b3236), new THREE.Color(0x2f3542), new THREE.Color(0x3b3a33)];
    for (let k = 0; k <= SAMPLES; k++) {
      const p = pts[k], q = pts[Math.min(SAMPLES, k + 1)], o = pts[Math.max(0, k - 1)];
      const dir = new THREE.Vector3(q.x - o.x, 0, q.z - o.z).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(TRACK_W / 2);
      pos.push(p.x + side.x, p.y + 0.02, p.z + side.z, p.x - side.x, p.y + 0.02, p.z - side.z);
      const frac = k / SAMPLES;
      const c = sectorCol[frac < b[1] ? 0 : frac < b[2] ? 1 : 2];
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (k < SAMPLES) {
        const a = k * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    tg.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    tg.setIndex(idx);
    tg.computeVertexNormals();
    scene.add(new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide })));

    /* Kerb-white edges; they take the track status colour (SC, red flag)
       the way the 2D map's outline does. */
    const edgeMat = new THREE.LineBasicMaterial({ color: EDGE, transparent: true, opacity: 0.55 });
    for (const off of [0, 3]) {
      const edge: THREE.Vector3[] = [];
      for (let k = 0; k <= SAMPLES; k++) edge.push(new THREE.Vector3(pos[k * 6 + off], pos[k * 6 + off + 1] + 0.03, pos[k * 6 + off + 2]));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(edge), edgeMat));
    }
    /* Centre line in sector colours — the 2D map's language. */
    [0xe10600, 0x3b9bff, 0xffd644].forEach((color, s) => {
      const from = Math.round(b[s] * SAMPLES), to = Math.round(b[s + 1] * SAMPLES);
      const lg = new THREE.BufferGeometry().setFromPoints(pts.slice(from, to + 1).map((p) => p.clone().setY(p.y + 0.06)));
      scene.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 })));
    });
    /* Curtain from the track to the ground, so height reads as height. */
    const cpos: number[] = [], cidx: number[] = [];
    for (let k = 0; k <= SAMPLES; k += 2) {
      const p = pts[k];
      cpos.push(p.x, p.y, p.z, p.x, 0, p.z);
      if (k + 2 <= SAMPLES) {
        const a = k;
        cidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute("position", new THREE.Float32BufferAttribute(cpos, 3));
    cg.setIndex(cidx);
    scene.add(new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xe10600, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false })));
    /* Start / finish line. */
    const s0 = pts[0], s1 = pts[2];
    const gantry = new THREE.Mesh(new THREE.BoxGeometry(TRACK_W * 1.3, 0.06, 0.25), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    gantry.position.set(s0.x, s0.y + 0.05, s0.z);
    gantry.rotation.y = Math.atan2(s1.x - s0.x, s1.z - s0.z);
    scene.add(gantry);

    /* ---- Cars: one instanced fleet + a light group per car (its code
       label, and the chase camera's target) ---- */
    const nums: number[] = tl.nums;
    const fleet = createFleet(nums.map((n) => data.drivers[n]?.teamColor ?? "#8B95A7"));
    fleet.meshes.forEach((m) => scene.add(m));
    const labelTex = (code: string, color: string) => {
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 56;
      const x = c.getContext("2d")!;
      x.fillStyle = color;
      x.beginPath();
      x.roundRect(4, 4, 120, 48, 10);
      x.fill();
      const L = parseInt(color.slice(1), 16);
      const lum = ((L >> 16) & 255) * 0.299 + ((L >> 8) & 255) * 0.587 + (L & 255) * 0.114;
      x.fillStyle = lum > 150 ? "#08090c" : "#ffffff";
      x.font = "700 30px ui-monospace, Menlo, monospace";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(code, 64, 29);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    type Car = { num: number; group: THREE.Group; label: THREE.Sprite; slot: number; heading: THREE.Quaternion; seen: boolean };
    const cars = new Map<number, Car>();
    nums.forEach((num, slot) => {
      const id = data.drivers[num] ?? {};
      const group = new THREE.Group();
      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: labelTex(id.code ?? String(num), id.teamColor ?? "#8B95A7"), depthTest: false, sizeAttenuation: false })
      );
      label.scale.set(0.055, 0.024, 1);
      label.position.y = 0.55;
      label.userData.num = num;
      group.add(label);
      scene.add(group);
      cars.set(num, { num, group, label, slot, heading: new THREE.Quaternion(), seen: false });
    });

    /* Click a label to focus that driver (a drag is the orbit, not a click). */
    const ray = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects([...cars.values()].filter((c) => c.group.visible).map((c) => c.label))[0];
      if (hit) onFocusRef.current(hit.object.userData.num);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    /* ---- Resize ---- */
    const resize = () => {
      const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    /* ---- Loop ---- */
    let raf = 0, last = performance.now();
    let lastCam: Cam | null = null;
    const tmp = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Vector3();
    const look = new THREE.Object3D();
    const edgeCol = new THREE.Color();
    const loop = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      const t = clockRef.current.t;
      const focusNum = focusRef.current;
      const speaking = speakingRef.current;

      /* Track status on the edges. */
      const status = data.status.find((s: any) => t >= s.from && t <= s.to);
      if (status) {
        edgeMat.color.set(STATUS_EDGE[status.type] ?? EDGE);
        edgeMat.opacity = status.type === "red" ? 0.95 : 0.6 + 0.35 * Math.sin(now / 260);
      } else if (!edgeMat.color.equals(edgeCol.set(EDGE))) {
        edgeMat.color.set(EDGE);
        edgeMat.opacity = 0.55;
      }

      /* Heading: ease toward a point ahead with a time constant (frame-rate
         independent) — aiming straight at it turns in steps at every
         vertex of the racing line. Snap after a seek. */
      const turn = 1 - Math.exp(-dt / 90);
      const snap = tl.snapshot(t);
      const mode = camRef.current;
      const chased = mode === "chase" ? focusNum ?? snap.find((c: any) => c.state !== "retired")?.num : null;
      snap.forEach((car: any, i: number) => {
        const obj = cars.get(car.num);
        if (!obj) return;
        const hide = car.state === "retired" || (car.state === "finished" && t - car.at > 90_000);
        obj.group.visible = !hide;
        if (hide) {
          fleet.set(obj.slot, obj.group.position, obj.heading, 0, 0, false);
          obj.seen = false;
          return;
        }
        const [x, y, z] = pointAtDist3(ref, car.dist);
        const [x2, y2, z2] = pointAtDist3(ref, car.dist + 60);
        toScene(x, y, z, p);
        toScene(x2, y2, z2, q);
        const jumped = obj.seen && obj.group.position.distanceTo(p) > 6;
        obj.group.position.copy(p);
        look.position.copy(p);
        look.lookAt(q);
        if (!obj.seen || jumped) obj.heading.copy(look.quaternion);
        else obj.heading.slerp(look.quaternion, turn);
        obj.seen = true;
        obj.group.quaternion.copy(obj.heading);
        /* Wheels roll with the distance travelled. */
        fleet.set(obj.slot, p, obj.heading, CAR_SCALE, car.dist / UNIT / (fleet.wheelRadius * CAR_SCALE), true);

        /* Labels carry the state, as the 2D badges do: faded in the pits
           or once finished, dimmed when another driver is focused, and a
           gentle pulse while their team radio plays. */
        const isFocus = car.num === focusNum;
        const faded = car.inPit || car.state === "finished" ? 0.45 : 1;
        (obj.label.material as THREE.SpriteMaterial).opacity = faded * (focusNum != null && !isFocus ? 0.3 : 1);
        const k = car.num === speaking ? 1.15 + 0.12 * Math.sin(now / 140) : isFocus ? 1.2 : 1;
        obj.label.scale.set(0.055 * k, 0.024 * k, 1);
        obj.label.renderOrder = isFocus ? 200 : 100 - i; // leaders on top, focus above all
        /* Up close the chased car's own label floats over the car ahead —
           and you know who you're following. */
        obj.label.visible = car.num !== chased;
      });
      fleet.commit();

      /* Camera. Presets move once; chase follows every frame. */
      if (mode === "chase") {
        const target = chased != null ? cars.get(chased) : undefined;
        if (target?.group.visible) {
          const g = target.group;
          tmp.set(0, 0.9, -2.6).applyQuaternion(g.quaternion).add(g.position);
          if (lastCam !== "chase") camera.position.copy(tmp);
          /* Time-based smoothing — a fixed per-frame lerp judders. */
          camera.position.lerp(tmp, 1 - Math.exp(-dt / 140));
          controls.target.lerp(g.position, 1 - Math.exp(-dt / 70));
        }
      } else if (mode !== lastCam) {
        controls.target.set(0, 0, 0);
        if (mode === "overview") camera.position.copy(overviewPos());
        else camera.position.set(span * 0.55, span * 0.08 + 2, span * 0.1);
      }
      lastCam = mode;
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      fleet.dispose();
      scene.traverse((o: any) => {
        o.geometry?.dispose?.();
        const m = o.material;
        (Array.isArray(m) ? m : m ? [m] : []).forEach((mm: any) => {
          mm.map?.dispose?.();
          mm.dispose?.();
        });
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [data, clockRef, speakingRef, onUnsupported]);

  return (
    <div className="absolute inset-0">
      <div ref={mountRef} className="absolute inset-0" role="img" aria-label={`${data.raceName} 3D replay`} />
      {/* Camera presets, under the lap counter (lower thirds own the
          bottom-left, the radio card the bottom-right). */}
      <div className="absolute left-4 top-[92px] flex rounded-row border border-carbon-700 bg-carbon-950/85 p-0.5 backdrop-blur-sm">
        {CAMS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setCam(id)}
            className={`timing rounded-row px-2.5 py-1 text-micro font-bold uppercase tracking-wider transition-colors duration-micro
              ${cam === id ? "bg-carbon-700 text-carbon-100" : "text-carbon-400 hover:text-carbon-100"}`}
          >
            {id === "chase" ? `${label} ${focus != null ? data.drivers[focus]?.code ?? "" : "leader"}` : label}
          </button>
        ))}
      </div>
    </div>
  );
}
