/**
 * Procedural F1 cars for the 3D replay, drawn as ONE instanced fleet.
 *
 * The car is built in "car units" (metres, real proportions: 5.6 m long,
 * ~2 m wide), nose pointing +Z. Every car shares the same shape, so
 * instead of ~33 meshes per car (≈750 draw calls for the field) the parts
 * are merged per material and drawn with InstancedMesh: one draw call per
 * material for ALL cars, team colours supplied per instance.
 *
 *   body    team colour   (instanceColor)
 *   accent  livery stripe (instanceColor: white on dark teams, black on light)
 *   helmet                (instanceColor)
 *   carbon  wings, floor, halo
 *   black   intakes, cockpit
 *   4 wheels (FL, FR, RL, RR) — tyre + rim + tread marks merged with vertex
 *            colours, so each wheel position is one instanced mesh that
 *            can spin about its own axle.
 *
 * ≈ 9 draw calls for the whole grid.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const WHEEL_R = 0.36;

function extrudeXZ(points: [number, number][], height: number, bevel = 0.04) {
  /* Plan-view outline (x across, z along) extruded upward by `height`. */
  const s = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(Math.PI / 2);
  g.translate(0, height, 0);
  return g;
}
function extrudeZY(points: [number, number][], width: number, bevel = 0.03) {
  /* Side-profile outline (z along, y up) extruded across by `width`. */
  const s = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 6 });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2, 0, 0);
  return g;
}
const mirrorX = (pts: [number, number][]) => [...pts, ...[...pts].reverse().map(([x, z]) => [-x, z] as [number, number])];

/** A geometry copy moved/rotated into place, ready to merge. */
function placed(g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rotX = 0, scale?: [number, number, number]) {
  let c = g.clone();
  if (scale) c.scale(...scale);
  if (rotX) c.rotateX(rotX);
  c.translate(x, y, z);
  /* Merging needs identical attribute sets — uv isn't used, drop it. */
  c.deleteAttribute("uv");
  if (c.index) c = c.toNonIndexed();
  return c;
}
function painted(g: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

function buildParts() {
  const tub = extrudeXZ(mirrorX([[0.17, 1.15], [0.27, 0.75], [0.3, 0.45], [0.6, 0.2], [0.66, -0.2], [0.62, -0.8], [0.45, -1.35], [0.26, -1.85], [0.2, -2.25]]), 0.27, 0.07);
  const nose = new THREE.CylinderGeometry(0.07, 0.17, 1.5, 12, 1);
  nose.rotateX(Math.PI / 2);
  const cover = extrudeZY([[0.4, 0.36], [0.24, 0.74], [0.05, 0.8], [-0.35, 0.76], [-0.9, 0.62], [-1.5, 0.5], [-2.0, 0.42], [-2.25, 0.4], [-2.25, 0.33], [0.4, 0.33]], 0.3, 0.05);
  const fin = extrudeZY([[-0.4, 0.74], [-1.6, 0.56], [-1.6, 0.5], [-0.4, 0.68]], 0.02, 0.005);
  const halo = new THREE.TorusGeometry(0.3, 0.028, 8, 24, Math.PI);
  halo.rotateX(Math.PI / 2); // arc in FRONT of the driver, open at the back
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

  const body = mergeGeometries([
    placed(tub, 0, 0.08, 0),
    placed(nose, 0, 0.27, 1.85, 0, [1, 0.75, 1]),
    placed(cover), placed(fin),
    placed(box(0.03, 0.2, 0.55), 0.97, 0.15, 2.5), placed(box(0.03, 0.2, 0.55), -0.97, 0.15, 2.5), // FW endplates
    placed(box(0.03, 0.4, 0.46), 0.5, 0.9, -2.48), placed(box(0.03, 0.4, 0.46), -0.5, 0.9, -2.48), // RW endplates
  ])!;
  const accent = mergeGeometries([
    placed(box(0.06, 0.012, 1.9), 0.42, 0.365, -0.35), placed(box(0.06, 0.012, 1.9), -0.42, 0.365, -0.35),
  ])!;
  const helmet = placed(new THREE.SphereGeometry(0.13, 16, 12), 0, 0.5, 0.62);
  const pillar = new THREE.CylinderGeometry(0.025, 0.025, 0.24, 8);
  const carbon = mergeGeometries([
    placed(box(1.55, 0.04, 3.7), 0, 0.06, -0.45), // floor
    placed(halo, 0, 0.66, 0.62), placed(pillar, 0, 0.55, 0.93, 0.35),
    placed(box(1.95, 0.035, 0.42), 0, 0.1, 2.58), placed(box(1.7, 0.03, 0.22), 0, 0.17, 2.42), // front wing
    placed(box(1.0, 0.05, 0.32), 0, 0.92, -2.5), placed(box(1.0, 0.035, 0.2), 0, 1.03, -2.42), // rear wing
    placed(box(0.06, 0.45, 0.12), 0, 0.66, -2.38), placed(box(0.8, 0.03, 0.14), 0, 0.42, -2.45), // pylon, beam
  ])!;
  const intake = new THREE.CircleGeometry(0.11, 16);
  const black = mergeGeometries([
    placed(intake, 0, 0.7, 0.25, 0, [1, 0.8, 1]),
    placed(box(0.22, 0.16, 0.03), 0.52, 0.27, 0.24), placed(box(0.22, 0.16, 0.03), -0.52, 0.27, 0.24),
    placed(box(0.34, 0.06, 0.72), 0, 0.41, 0.72),
  ])!;

  /* One wheel (axle along x, centred on the origin): tyre + rim + treads
     in vertex colours; `side` puts the rim on the outside. */
  const wheel = (width: number, side: 1 | -1) => {
    const tyre = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, width, 24);
    tyre.rotateZ(Math.PI / 2);
    const rim = new THREE.CylinderGeometry(WHEEL_R * 0.6, WHEEL_R * 0.6, 0.02, 16);
    rim.rotateZ(Math.PI / 2);
    const parts = [painted(placed(tyre), 0x0c0c0e), painted(placed(rim, side * (width / 2 + 0.005)), 0x9aa0a8)];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      parts.push(painted(placed(box(0.02, 0.05, 0.05), side * (width / 2 + 0.01), Math.cos(a) * WHEEL_R * 0.82, Math.sin(a) * WHEEL_R * 0.82), 0x8a8f99));
    }
    return mergeGeometries(parts)!;
  };
  return {
    body, accent, helmet, carbon, black,
    wheels: [
      { geo: wheel(0.3, 1), pos: new THREE.Vector3(0.8, WHEEL_R, 1.72) },
      { geo: wheel(0.3, -1), pos: new THREE.Vector3(-0.8, WHEEL_R, 1.72) },
      { geo: wheel(0.4, 1), pos: new THREE.Vector3(0.78, WHEEL_R, -1.72) },
      { geo: wheel(0.4, -1), pos: new THREE.Vector3(-0.78, WHEEL_R, -1.72) },
    ],
  };
}

export type Fleet = {
  meshes: THREE.Object3D[];
  wheelRadius: number;
  /** Place car i; `spin` is the wheel angle in radians. Call commit() after the last car. */
  set: (i: number, pos: THREE.Vector3, quat: THREE.Quaternion, scale: number, spin: number, visible: boolean) => void;
  commit: () => void;
  dispose: () => void;
};

/** One instanced fleet for `teamHexes.length` cars (index = car slot). */
export function createFleet(teamHexes: string[]): Fleet {
  const P = buildParts();
  const N = teamHexes.length;
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const make = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const m = new THREE.InstancedMesh(geo, mat, N);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    /* Instances spread over the whole circuit; the base geometry's bounds
       would make three cull the lot as soon as car 0 left the view. */
    m.frustumCulled = false;
    return m;
  };
  const body = make(P.body, std({ color: 0xffffff, roughness: 0.32, metalness: 0.35 }));
  const accent = make(P.accent, std({ color: 0xffffff, roughness: 0.4, metalness: 0.2 }));
  const helmet = make(P.helmet, std({ color: 0xffffff, roughness: 0.3, metalness: 0.4 }));
  const carbon = make(P.carbon, std({ color: 0x15171c, roughness: 0.55, metalness: 0.2 }));
  const black = make(P.black, new THREE.MeshBasicMaterial({ color: 0x050505 }));
  const wheelMat = std({ vertexColors: true, roughness: 0.75, metalness: 0.25 });
  const wheels = P.wheels.map((w) => ({ mesh: make(w.geo, wheelMat), pos: w.pos }));

  const c = new THREE.Color();
  teamHexes.forEach((hex, i) => {
    c.set(hex);
    body.setColorAt(i, c);
    const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    accent.setColorAt(i, new THREE.Color(lum > 0.6 ? 0x16181d : 0xf2f3f5));
    helmet.setColorAt(i, new THREE.Color(lum > 0.6 ? 0x16181d : 0xffd644));
  });

  const M = new THREE.Matrix4(), W = new THREE.Matrix4(), R = new THREE.Matrix4(), T = new THREE.Matrix4();
  const S = new THREE.Vector3(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const statics = [body, accent, helmet, carbon, black];

  return {
    meshes: [...statics, ...wheels.map((w) => w.mesh)],
    wheelRadius: WHEEL_R,
    set(i, pos, quat, scale, spin, visible) {
      if (!visible) {
        statics.forEach((m) => m.setMatrixAt(i, ZERO));
        wheels.forEach((w) => w.mesh.setMatrixAt(i, ZERO));
        return;
      }
      M.compose(pos, quat, S.setScalar(scale));
      statics.forEach((m) => m.setMatrixAt(i, M));
      R.makeRotationX(spin);
      for (const w of wheels) {
        T.makeTranslation(w.pos.x, w.pos.y, w.pos.z);
        W.multiplyMatrices(M, T).multiply(R);
        w.mesh.setMatrixAt(i, W);
      }
    },
    commit() {
      statics.forEach((m) => (m.instanceMatrix.needsUpdate = true));
      wheels.forEach((w) => (w.mesh.instanceMatrix.needsUpdate = true));
    },
    dispose() {
      wheelMat.dispose();
      [...statics, ...wheels.map((w) => w.mesh)].forEach((m) => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
    },
  };
}
