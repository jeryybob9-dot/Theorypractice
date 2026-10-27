// Low-poly models for road users and street furniture, built from primitives at load time.
import * as THREE from '../../vendor/three.module.min.js';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';

// Merge a model's direct, non-animated meshes that share a material into one mesh each,
// so a car costs ~20 draw calls instead of ~35. Groups (wheels, doors) are left alone.
function mergeStatic(g) {
  const byMat = new Map();
  for (const c of [...g.children]) {
    if (!c.isMesh) continue;
    c.updateMatrix();
    let geo = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
    geo.applyMatrix4(c.matrix);
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!byMat.has(c.material)) byMat.set(c.material, []);
    byMat.get(c.material).push(geo);
    g.remove(c);
  }
  for (const [m, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((x) => x.dispose());
    g.add(new THREE.Mesh(merged, m));
  }
  return g;
}

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  const { unique, ...params } = opts;
  if (!unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshLambertMaterial({ color, ...params });
  if (!unique) matCache.set(key, m);
  return m;
}

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}

const box = (w, hh, l) => new THREE.BoxGeometry(w, hh, l);

// Extrude a side profile (points as [z, y], z positive = forward) across a width, centred.
function profileGeo(points, width, bevel = 0.04) {
  const shape = new THREE.Shape();
  points.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1 });
  // shape x -> forward; extrude z -> width. Rotate so forward is -Z and width is X.
  g.translate(0, 0, -(width - 2 * bevel) / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

export const CAR_COLOURS = ['#c9ccd1', '#1c1f24', '#f2f2f0', '#2d4b7a', '#9b1c1c', '#5b6066', '#3a4a3b', '#7b8794', '#0f2240', '#b4a58a', '#e0e3e6', '#2b2e33', '#6d1f2d', '#4f6e8f'];

const BODY_STYLES = {
  hatch: { len: 4.0, wid: 1.76, body: [[-2.0, 0.28], [-2.05, 0.62], [-1.95, 0.95], [1.1, 0.98], [1.95, 0.78], [2.0, 0.42], [1.95, 0.28]], cabin: [[-1.9, 0.95], [-1.7, 1.42], [0.2, 1.48], [1.05, 0.98]] },
  saloon: { len: 4.6, wid: 1.8, body: [[-2.3, 0.3], [-2.32, 0.62], [-2.25, 0.92], [1.35, 0.95], [2.25, 0.75], [2.3, 0.42], [2.25, 0.3]], cabin: [[-1.6, 0.92], [-1.0, 1.4], [0.45, 1.43], [1.3, 0.95]] },
  estate: { len: 4.7, wid: 1.8, body: [[-2.35, 0.3], [-2.37, 0.62], [-2.3, 0.95], [1.35, 0.97], [2.3, 0.76], [2.35, 0.42], [2.3, 0.3]], cabin: [[-2.25, 0.95], [-2.15, 1.44], [0.45, 1.46], [1.3, 0.97]] },
  suv: { len: 4.5, wid: 1.85, body: [[-2.25, 0.38], [-2.28, 0.75], [-2.2, 1.12], [1.35, 1.15], [2.2, 0.95], [2.25, 0.5], [2.2, 0.38]], cabin: [[-2.1, 1.12], [-1.95, 1.7], [0.5, 1.73], [1.3, 1.15]] },
  van: { len: 5.0, wid: 1.95, body: [[-2.5, 0.35], [-2.5, 2.1], [0.9, 2.15], [1.6, 1.35], [2.45, 1.0], [2.5, 0.45], [2.45, 0.35]], cabin: null },
};

// A car or van. Returns a group with .userData.parts for lights, wheels and doors.
export function makeCar({ color = '#c9ccd1', style = 'hatch', parts = true } = {}) {
  const S = BODY_STYLES[style] || BODY_STYLES.hatch;
  const g = new THREE.Group();
  const paint = mat(color);
  const glass = mat('#56697a'); // windows reflect the sky, so read lighter than black
  const dark = mat('#191a1c');
  const body = mesh(profileGeo(S.body, S.wid), paint);
  g.add(body);
  if (S.cabin) {
    g.add(mesh(profileGeo(S.cabin, S.wid - 0.16, 0.03), glass));
    // roof skin and pillars in body colour
    const roofZ0 = S.cabin[1][0], roofZ1 = S.cabin[2][0], roofY = S.cabin[2][1];
    g.add(mesh(box(S.wid - 0.2, 0.06, roofZ1 - roofZ0 - 0.05), paint, 0, roofY + 0.01, -(roofZ0 + roofZ1) / 2));
    const beltY = S.cabin[0][1];
    const bz = -(roofZ0 + roofZ1) / 2 + 0.15;
    g.add(mesh(box(S.wid - 0.13, roofY - beltY, 0.12), paint, 0, (roofY + beltY) / 2, bz)); // B-pillar
    // A-pillars follow the windscreen rake
    const [wz0, wy0] = S.cabin[2], [wz1, wy1] = S.cabin[3];
    const aLen = Math.hypot(wz1 - wz0, wy1 - wy0);
    for (const sx of [-1, 1]) {
      const a = mesh(box(0.08, aLen, 0.08), paint, sx * (S.wid / 2 - 0.1), (wy0 + wy1) / 2, -(wz0 + wz1) / 2);
      a.rotation.x = Math.atan2(wz1 - wz0, wy0 - wy1);
      g.add(a);
    }
    // black window trim along the sides
    g.add(mesh(box(S.wid - 0.12, 0.035, Math.abs(S.cabin[3][0] - S.cabin[0][0])), dark, 0, beltY + 0.02, -(S.cabin[3][0] + S.cabin[0][0]) / 2));
  } else {
    // van: windscreen and side windows
    g.add(mesh(box(S.wid + 0.01, 0.55, 0.8), glass, 0, 1.6, -1.1));
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.235, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const hub = mat('#9aa0a6');
  const wheels = [];
  const wz = S.len / 2 - 0.75;
  for (const [x, z] of [[-S.wid / 2 + 0.12, -wz], [S.wid / 2 - 0.12, -wz], [-S.wid / 2 + 0.12, wz], [S.wid / 2 - 0.12, wz]]) {
    const w = new THREE.Group();
    w.add(mesh(wheelGeo, dark));
    w.add(mesh(hubGeo, hub));
    w.position.set(x, 0.32, z);
    g.add(w);
    wheels.push(w);
  }
  // bumpers and plates (front white, rear yellow — UK)
  const fz = -S.len / 2, rz = S.len / 2;
  g.add(mesh(box(S.wid - 0.1, 0.16, 0.12), dark, 0, 0.38, fz - 0.02));
  g.add(mesh(box(S.wid - 0.1, 0.16, 0.12), dark, 0, 0.4, rz + 0.02));
  g.add(mesh(box(0.52, 0.11, 0.02), mat('#f4f4f0'), 0, 0.5, fz - 0.06));
  g.add(mesh(box(0.52, 0.11, 0.02), mat('#f3c623'), 0, style === 'van' ? 0.62 : 0.62, rz + 0.06));
  // lights
  const lights = { head: [], tail: [], brake: [], indL: [], indR: [], reverse: [] };
  if (parts) {
    const headM = mat('#f6f4e8', { emissive: '#000000', unique: true });
    const tailM = mat('#7a0d0d', { emissive: '#300000', unique: true });
    const indLM = mat('#a0631a', { emissive: '#000000', unique: true });
    const indRM = mat('#a0631a', { emissive: '#000000', unique: true });
    const revM = mat('#d9d9d9', { emissive: '#000000', unique: true });
    const hy = style === 'van' ? 0.95 : style === 'suv' ? 0.95 : 0.72;
    const ty = style === 'van' ? 1.0 : style === 'suv' ? 0.98 : 0.82;
    for (const sx of [-1, 1]) {
      g.add(mesh(box(0.34, 0.12, 0.05), headM, sx * (S.wid / 2 - 0.27), hy, fz - 0.0));
      g.add(mesh(box(0.3, 0.14, 0.05), tailM, sx * (S.wid / 2 - 0.22), ty, rz - 0.0));
      const im = sx < 0 ? indLM : indRM;
      g.add(mesh(box(0.1, 0.08, 0.05), im, sx * (S.wid / 2 - 0.06), hy, fz - 0.0));
      g.add(mesh(box(0.1, 0.1, 0.05), im, sx * (S.wid / 2 - 0.06), ty - 0.1, rz + 0.0));
      g.add(mesh(box(0.06, 0.06, 0.2), im, sx * (S.wid / 2 + 0.01), hy + 0.12, fz + 0.9)); // side repeater
    }
    g.add(mesh(box(0.16, 0.08, 0.05), revM, -0.25, ty - 0.14, rz + 0.01));
    lights.head.push(headM); lights.tail.push(tailM); lights.indL.push(indLM); lights.indR.push(indRM); lights.reverse.push(revM);
    // driver's door (right-hand side in UK cars) on a hinge for door-opening hazards
    if (style !== 'van') {
      const hinge = new THREE.Group();
      hinge.position.set(S.wid / 2 + 0.01, 0, -0.35);
      const door = mesh(box(0.06, 0.62, 1.0), paint, 0, 0.66, 0.5);
      hinge.add(door);
      hinge.add(mesh(box(0.04, 0.4, 0.85), glass, 0, 1.15, 0.52));
      hinge.visible = false;
      g.add(hinge);
      g.userData.door = hinge;
    }
  }
  g.userData.parts = { wheels, lights, wheelR: 0.32, length: S.len, width: S.wid };
  g.userData.kind = 'car';
  return mergeStatic(g);
}

export function makeBus({ color = '#c8102e', decks = 1, length = 11.5 } = {}) {
  const g = new THREE.Group();
  const paint = mat(color);
  const glass = mat('#1a2229');
  const hgt = decks === 2 ? 4.3 : 3.0;
  g.add(mesh(box(2.5, hgt - 0.35, length), paint, 0, 0.35 + (hgt - 0.35) / 2, 0));
  g.add(mesh(box(2.52, 0.95, length - 1.6), glass, 0, 1.75, 0.4));
  if (decks === 2) g.add(mesh(box(2.52, 0.9, length - 0.6), glass, 0, 3.35, 0));
  g.add(mesh(box(2.4, 1.6, 0.05), glass, 0, 1.6, -length / 2 - 0.01));
  g.add(mesh(box(1.6, 0.35, 0.05), mat('#111111', { emissive: '#ff9a00', emissiveIntensity: 0.6 }), 0, hgt - 0.35, -length / 2 - 0.02));
  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const z of [-length / 2 + 2.4, length / 2 - 2.6]) for (const x of [-1.15, 1.15]) {
    const w = mesh(wheelGeo, mat('#151515'), x, 0.5, z);
    g.add(w); wheels.push(w);
  }
  const lights = vehicleLights(g, 2.5, length, 0.7, 0.9);
  g.userData.parts = { wheels, lights, wheelR: 0.5, length, width: 2.5 };
  g.userData.kind = 'bus';
  return mergeStaticExcept(g, wheels);
}

export function makeLorry({ color = '#e8e8e8', cab = '#1f4e8c' } = {}) {
  const g = new THREE.Group();
  g.add(mesh(box(2.45, 2.6, 2.2), mat(cab), 0, 1.75, -4.9));
  g.add(mesh(box(2.47, 0.9, 0.05), mat('#1a2229'), 0, 2.4, -6.01));
  g.add(mesh(box(2.55, 3.4, 9.6), mat(color), 0, 2.55, 1.1));
  g.add(mesh(box(2.3, 0.4, 11.6), mat('#222222'), 0, 0.75, 0));
  const wheelGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.4, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const z of [-4.8, 2.6, 4.0, 5.4]) for (const x of [-1.05, 1.05]) {
    const w = mesh(wheelGeo, mat('#151515'), x, 0.52, z);
    g.add(w); wheels.push(w);
  }
  // rear markings (red/yellow)
  g.add(mesh(box(2.2, 0.2, 0.03), mat('#e0b000'), 0, 1.1, 5.92));
  const lights = vehicleLights(g, 2.5, 11.8, 0.9, 1.1, -5.95, 5.92);
  g.userData.parts = { wheels, lights, wheelR: 0.52, length: 11.8, width: 2.55 };
  g.userData.kind = 'lorry';
  return mergeStaticExcept(g, wheels);
}

export function makeTractor({ color = '#2f6b2f' } = {}) {
  const g = new THREE.Group();
  const paint = mat(color);
  g.add(mesh(box(1.1, 0.9, 2.2), paint, 0, 1.2, -0.6));
  g.add(mesh(box(1.5, 0.12, 1.3), paint, 0, 1.15, 0.8));
  const frame = mat('#222222');
  for (const [x, z] of [[-0.7, 0.2], [0.7, 0.2], [-0.7, 1.35], [0.7, 1.35]]) g.add(mesh(box(0.06, 1.45, 0.06), frame, x, 1.95, z));
  g.add(mesh(box(1.55, 0.08, 1.3), paint, 0, 2.68, 0.78));
  g.add(mesh(box(1.4, 1.2, 1.1), mat('#26313a', { transparent: true, opacity: 0.55 }), 0, 1.95, 0.78));
  const beacon = mat('#b86b00', { emissive: '#000000', unique: true });
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.15, 8), beacon, 0, 2.8, 0.78));
  const rearGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.45, 16); rearGeo.rotateZ(Math.PI / 2);
  const frontGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.3, 14); frontGeo.rotateZ(Math.PI / 2);
  const tyre = mat('#141414');
  const wheels = [mesh(rearGeo, tyre, -0.95, 0.8, 0.9), mesh(rearGeo, tyre, 0.95, 0.8, 0.9), mesh(frontGeo, tyre, -0.75, 0.45, -1.2), mesh(frontGeo, tyre, 0.75, 0.45, -1.2)];
  wheels.forEach((w) => g.add(w));
  const lights = vehicleLights(g, 1.5, 3.4, 1.2, 1.3, -1.75, 1.5);
  lights.beacon = [beacon];
  g.userData.parts = { wheels, lights, wheelR: 0.8, length: 3.6, width: 2.0 };
  g.userData.kind = 'tractor';
  return mergeStaticExcept(g, wheels);
}

// as mergeStatic, but keeps the given meshes (e.g. wheels that are direct children) separate
function mergeStaticExcept(g, keep) {
  const holder = new THREE.Group();
  for (const k of keep) { g.remove(k); holder.add(k); }
  mergeStatic(g);
  for (const k of keep) { holder.remove(k); g.add(k); }
  return g;
}

function vehicleLights(g, width, length, hy, ty, fz = -length / 2 - 0.02, rz = length / 2 + 0.02) {
  const headM = mat('#f6f4e8', { emissive: '#000000', unique: true });
  const tailM = mat('#7a0d0d', { emissive: '#300000', unique: true });
  const indLM = mat('#a0631a', { emissive: '#000000', unique: true });
  const indRM = mat('#a0631a', { emissive: '#000000', unique: true });
  for (const sx of [-1, 1]) {
    g.add(mesh(box(0.3, 0.16, 0.05), headM, sx * (width / 2 - 0.3), hy, fz));
    g.add(mesh(box(0.25, 0.22, 0.05), tailM, sx * (width / 2 - 0.25), ty, rz));
    const im = sx < 0 ? indLM : indRM;
    g.add(mesh(box(0.14, 0.12, 0.05), im, sx * (width / 2 - 0.08), hy + 0.2, fz));
    g.add(mesh(box(0.14, 0.12, 0.05), im, sx * (width / 2 - 0.08), ty + 0.22, rz));
  }
  return { head: [headM], tail: [tailM], brake: [], indL: [indLM], indR: [indRM], reverse: [] };
}

// ---- People and animals --------------------------------------------------------------------

const SKIN = ['#f1c7a5', '#e0ac85', '#c68863', '#8d5a3b', '#5c3a24'];
const CLOTHES = ['#26354a', '#5a2a2a', '#2f4f3f', '#6b6f75', '#1b1b1b', '#7d4b8a', '#a8452f', '#3d6c9e', '#c9a227', '#8a8f96', '#e5e2da', '#4a3b2a'];
const TROUSERS = ['#1f2833', '#2c2c2c', '#3d4e66', '#4a4a4a', '#5b4a37', '#20304a'];

export function makePerson({ child = false, rnd = Math.random, top, legs, hiVis = false, elderly = false, bag = false } = {}) {
  const g = new THREE.Group();
  const s = child ? 0.62 : 1;
  const skin = mat(SKIN[Math.floor(rnd() * SKIN.length)]);
  const topM = mat(hiVis ? '#d7f230' : top || CLOTHES[Math.floor(rnd() * CLOTHES.length)]);
  const legM = mat(legs || TROUSERS[Math.floor(rnd() * TROUSERS.length)]);
  const inner = new THREE.Group();
  inner.scale.setScalar(s);
  g.add(inner);
  const legGeo = box(0.15, 0.82, 0.16); legGeo.translate(0, -0.41, 0);
  const armGeo = box(0.1, 0.62, 0.12); armGeo.translate(0, -0.31, 0);
  const legL = mesh(legGeo, legM, -0.1, 0.88, 0);
  const legR = mesh(legGeo, legM, 0.1, 0.88, 0);
  inner.add(legL, legR);
  inner.add(mesh(box(0.4, 0.6, 0.24), topM, 0, 1.18, 0));
  const armL = mesh(armGeo, topM, -0.26, 1.45, 0);
  const armR = mesh(armGeo, topM, 0.26, 1.45, 0);
  inner.add(armL, armR);
  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  head.add(mesh(new THREE.SphereGeometry(0.12, 12, 10), skin, 0, 0.04, 0));
  head.add(mesh(new THREE.SphereGeometry(0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(['#2a1b12', '#4b3020', '#b9925a', '#151515', '#8a8a8a'][Math.floor(rnd() * 5)]), 0, 0.06, 0.01));
  inner.add(head);
  if (bag) inner.add(mesh(box(0.08, 0.3, 0.3), mat('#3b2a1e'), 0.32, 0.95, 0));
  if (elderly) {
    inner.rotation.x = 0.08;
    const stick = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 6), mat('#4a3020'), 0.36, 0.45, -0.1);
    inner.add(stick);
  }
  g.userData.parts = { legL, legR, armL, armR, head, stride: child ? 0.9 : elderly ? 1.0 : 1.4 };
  g.userData.kind = 'person';
  return g;
}

export function makeCyclist({ rnd = Math.random, hiVis = rnd() < 0.5 } = {}) {
  const g = new THREE.Group();
  const frameM = mat(['#1d3f8a', '#a11d1d', '#111111', '#e8e8e8', '#2c7a3a'][Math.floor(rnd() * 5)]);
  const tyre = mat('#111111');
  const wheelGeo = new THREE.TorusGeometry(0.33, 0.025, 6, 18); wheelGeo.rotateY(Math.PI / 2);
  const wf = mesh(wheelGeo, tyre, 0, 0.35, -0.52);
  const wr = mesh(wheelGeo, tyre, 0, 0.35, 0.52);
  g.add(wf, wr);
  const bar = (len, x, y, z, rx) => { const m = mesh(box(0.04, 0.04, len), frameM, x, y, z); m.rotation.x = rx; g.add(m); };
  bar(0.95, 0, 0.62, 0, 0.05);
  bar(0.6, 0, 0.5, 0.25, 0.9);
  bar(0.6, 0, 0.55, -0.35, -0.6);
  g.add(mesh(box(0.5, 0.03, 0.03), mat('#222222'), 0, 1.02, -0.5));
  // rider
  const top = mat(hiVis ? '#d7f230' : CLOTHES[Math.floor(rnd() * CLOTHES.length)]);
  const legM = mat('#1c1c1c');
  const torso = mesh(box(0.36, 0.6, 0.22), top, 0, 1.25, -0.08);
  torso.rotation.x = -0.55;
  g.add(torso);
  const legGeo = box(0.13, 0.78, 0.14); legGeo.translate(0, -0.39, 0);
  const legL = mesh(legGeo, legM, -0.1, 1.0, 0.12);
  const legR = mesh(legGeo, legM, 0.1, 1.0, 0.12);
  g.add(legL, legR);
  const armGeo = box(0.09, 0.6, 0.1); armGeo.translate(0, -0.3, 0);
  const armL = mesh(armGeo, top, -0.22, 1.47, -0.22); armL.rotation.x = -1.0;
  const armR = mesh(armGeo, top, 0.22, 1.47, -0.22); armR.rotation.x = -1.0;
  g.add(armL, armR);
  const head = new THREE.Group();
  head.position.set(0, 1.62, -0.32);
  head.add(mesh(new THREE.SphereGeometry(0.115, 10, 8), mat(SKIN[Math.floor(rnd() * SKIN.length)])));
  head.add(mesh(new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(['#e8e8e8', '#1d1d1d', '#c22', '#2350a0'][Math.floor(rnd() * 4)]), 0, 0.03, 0));
  g.add(head);
  g.userData.parts = { wheels: [wf, wr], wheelR: 0.35, legL, legR, armL, armR, head, pedal: true };
  g.userData.kind = 'cyclist';
  return g;
}

export function makeMotorbike({ rnd = Math.random } = {}) {
  const g = new THREE.Group();
  const paint = mat(['#b01818', '#111111', '#1e4aa8', '#e8e8e8', '#e0a000'][Math.floor(rnd() * 5)]);
  const tyre = mat('#111111');
  const wg = new THREE.CylinderGeometry(0.31, 0.31, 0.12, 14); wg.rotateZ(Math.PI / 2);
  const wf = mesh(wg, tyre, 0, 0.31, -0.72), wr = mesh(wg, tyre, 0, 0.31, 0.7);
  g.add(wf, wr);
  g.add(mesh(box(0.3, 0.35, 1.1), paint, 0, 0.65, -0.05));
  g.add(mesh(box(0.28, 0.12, 0.6), mat('#1b1b1b'), 0, 0.88, 0.3));
  const headM = mat('#f6f4e8', { emissive: '#000000', unique: true });
  g.add(mesh(box(0.16, 0.12, 0.05), headM, 0, 0.9, -0.75));
  const tailM = mat('#7a0d0d', { emissive: '#300000', unique: true });
  g.add(mesh(box(0.12, 0.06, 0.04), tailM, 0, 0.8, 0.95));
  const jacket = mat(rnd() < 0.4 ? '#d7f230' : '#1c1c1c');
  const torso = mesh(box(0.38, 0.6, 0.24), jacket, 0, 1.28, 0.1); torso.rotation.x = -0.35;
  g.add(torso);
  const legM = mat('#222222');
  const legGeo = box(0.14, 0.6, 0.15); legGeo.translate(0, -0.3, 0);
  const l1 = mesh(legGeo, legM, -0.18, 0.98, 0.25); l1.rotation.x = 1.0;
  const l2 = mesh(legGeo, legM, 0.18, 0.98, 0.25); l2.rotation.x = 1.0;
  g.add(l1, l2);
  const head = mesh(new THREE.SphereGeometry(0.16, 12, 10), mat(['#111111', '#e8e8e8', '#b01818'][Math.floor(rnd() * 3)]), 0, 1.68, -0.05);
  g.add(head);
  g.userData.parts = { wheels: [wf, wr], wheelR: 0.31, lights: { head: [headM], tail: [tailM], brake: [], indL: [], indR: [], reverse: [] }, head };
  g.userData.kind = 'motorbike';
  return g;
}

function quadruped({ body, legs, color, neck = 0.4, headLen = 0.4, height, rnd = Math.random }) {
  const g = new THREE.Group();
  const m = mat(color);
  const [bw, bh, bl] = body;
  g.add(mesh(box(bw, bh, bl), m, 0, height, 0));
  const legGeo = new THREE.CylinderGeometry(bw * 0.12, bw * 0.1, legs, 6); legGeo.translate(0, -legs / 2, 0);
  const legsArr = [];
  for (const [x, z] of [[-bw / 3, -bl / 2 + 0.12], [bw / 3, -bl / 2 + 0.12], [-bw / 3, bl / 2 - 0.12], [bw / 3, bl / 2 - 0.12]]) {
    const l = mesh(legGeo, m, x, height - bh / 2 + 0.05, z);
    g.add(l); legsArr.push(l);
  }
  const neckM = mesh(box(bw * 0.5, neck, bw * 0.5), m, 0, height + bh / 2 + neck * 0.3, -bl / 2 + 0.05);
  neckM.rotation.x = -0.6;
  g.add(neckM);
  const head = mesh(box(bw * 0.45, bw * 0.45, headLen), m, 0, height + bh / 2 + neck * 0.75, -bl / 2 - headLen * 0.35);
  head.rotation.x = 0.3;
  g.add(head);
  g.userData.parts = { legs: legsArr, head, stride: legs * 1.6 };
  return g;
}

export function makeHorse({ rnd = Math.random, rider = true } = {}) {
  const color = ['#5a3a22', '#2a1a10', '#8b6b4a', '#d8d2c8', '#3b2a1c'][Math.floor(rnd() * 5)];
  const g = quadruped({ body: [0.6, 0.7, 1.7], legs: 1.05, color, neck: 0.75, headLen: 0.55, height: 1.4, rnd });
  g.add(mesh(box(0.08, 0.6, 0.08), mat('#1a1a1a'), 0, 1.35, 0.9));
  if (rider) {
    const hv = mat('#d7f230');
    const torso = mesh(box(0.38, 0.62, 0.24), hv, 0, 2.18, 0.05);
    g.add(torso);
    g.add(mesh(new THREE.SphereGeometry(0.14, 10, 8), mat('#151515'), 0, 2.62, 0.05));
    const legM = mat('#2a2a2a');
    g.add(mesh(box(0.13, 0.6, 0.14), legM, -0.34, 1.68, 0.05));
    g.add(mesh(box(0.13, 0.6, 0.14), legM, 0.34, 1.68, 0.05));
  }
  g.userData.kind = 'horse';
  return g;
}

export function makeDog({ rnd = Math.random } = {}) {
  const g = quadruped({ body: [0.24, 0.24, 0.62], legs: 0.32, color: ['#3a2a1a', '#d9c7a0', '#111111', '#8a5a2a'][Math.floor(rnd() * 4)], neck: 0.15, headLen: 0.22, height: 0.45, rnd });
  g.userData.kind = 'dog';
  return g;
}

export function makeDeer({ rnd = Math.random } = {}) {
  const g = quadruped({ body: [0.38, 0.42, 1.05], legs: 0.75, color: '#7a5233', neck: 0.45, headLen: 0.3, height: 1.0, rnd });
  const antler = mat('#d8c8a8');
  g.add(mesh(box(0.03, 0.3, 0.03), antler, -0.08, 1.85, -0.75));
  g.add(mesh(box(0.03, 0.3, 0.03), antler, 0.08, 1.85, -0.75));
  g.userData.kind = 'deer';
  return g;
}

export function makeBall() {
  const g = new THREE.Group();
  const b = mesh(new THREE.SphereGeometry(0.11, 12, 10), mat('#e8402f'));
  b.position.y = 0.11;
  g.add(b);
  g.userData.parts = { ball: b };
  g.userData.kind = 'ball';
  return g;
}

export function makePushchair({ rnd = Math.random } = {}) {
  const g = new THREE.Group();
  const m = mat(['#1b2a3a', '#3a1b2a', '#222222'][Math.floor(rnd() * 3)]);
  g.add(mesh(box(0.5, 0.45, 0.75), m, 0, 0.6, 0));
  g.add(mesh(box(0.5, 0.05, 0.05), mat('#999999'), 0, 1.0, 0.45));
  g.userData.kind = 'pushchair';
  return g;
}

export const rand = { SKIN, CLOTHES };
