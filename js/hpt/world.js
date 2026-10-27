// Builds a three.js scene for a hazard clip definition and animates it as a pure function of time,
// so clips can be replayed and scrubbed exactly.
import * as THREE from '../../vendor/three.module.min.js';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { Route, SpeedProfile, Track, within } from './road.js';
import * as TX from './textures.js';
import * as M from './models.js';
import { rng } from '../util.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = { x: 0, y: 0, z: 0 };

// ---------------------------------------------------------------------------------------------
// Static geometry batching: everything that never moves is merged per material per 150 m chunk.

class Batch {
  constructor() { this.buckets = new Map(); }
  add(key, geo, matrix, color, s = 0) {
    const chunk = Math.floor(s / 150);
    const k = `${key}|${chunk}`;
    let b = this.buckets.get(k);
    if (!b) this.buckets.set(k, (b = { key, geos: [] }));
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = color instanceof THREE.Color ? color : new THREE.Color(color || '#ffffff');
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    b.geos.push(g);
  }
  addObject(key, obj, matrix, s) {
    obj.updateMatrixWorld(true);
    const m = new THREE.Matrix4();
    obj.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      let p = o.parent, vis = true;
      while (p) { if (!p.visible) vis = false; p = p.parent; }
      if (!vis) return;
      m.multiplyMatrices(matrix, o.matrixWorld);
      this.add(o.material.transparent ? 'glass' : key, o.geometry, m, o.material.color, s);
    });
  }
  build(materials, scene, { shadows }) {
    const meshes = [];
    for (const { key, geos } of this.buckets.values()) {
      if (!geos.length) continue;
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, materials[key] || materials.vc);
      mesh.matrixAutoUpdate = false;
      if (shadows) {
        mesh.receiveShadow = !['glass', 'lamp', 'litwin', 'decal'].includes(key);
        mesh.castShadow = ['vc', 'hedge', 'brick', 'tree'].includes(key);
      }
      scene.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }
}

// Flat strip between lateral offsets d0 < d1, from s0 to s1, at height y above the road.
function ribbon(route, s0, s1, d0, d1, y = 0, uvScale = 1, step = 2, uvMode = 'world') {
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  const pos = [], uv = [];
  const L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const a = route.pos(s, d0, y), b = route.pos(s, d1, y);
    L.push([a.x, a.y, a.z, s]); R.push([b.x, b.y, b.z, s]);
  }
  const vu = (s) => (uvMode === 'road' ? s / uvScale : s / uvScale);
  const u0 = uvMode === 'road' ? 0 : d0 / uvScale, u1 = uvMode === 'road' ? 1 : d1 / uvScale;
  for (let i = 0; i < n; i++) {
    const l0 = L[i], r0 = R[i], l1 = L[i + 1], r1 = R[i + 1];
    pos.push(l0[0], l0[1], l0[2], r0[0], r0[1], r0[2], l1[0], l1[1], l1[2]);
    uv.push(u0, vu(l0[3]), u1, vu(r0[3]), u0, vu(l1[3]));
    pos.push(r0[0], r0[1], r0[2], r1[0], r1[1], r1[2], l1[0], l1[1], l1[2]);
    uv.push(u1, vu(r0[3]), u1, vu(r1[3]), u0, vu(l1[3]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// Vertical face at lateral d from height y0 to y1. facing = +1 faces +d (right), -1 faces left.
function wall(route, s0, s1, d, y0, y1, facing, step = 2) {
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  const pos = [];
  for (let i = 0; i < n; i++) {
    const sa = s0 + ((s1 - s0) * i) / n, sb = s0 + ((s1 - s0) * (i + 1)) / n;
    const B0 = route.pos(sa, d, y0), T0 = route.pos(sa, d, y1), B1 = route.pos(sb, d, y0), T1 = route.pos(sb, d, y1);
    const quad = facing > 0 ? [B0, B1, T0, B1, T1, T0] : [B0, T0, B1, B1, T0, T1];
    for (const p of quad) pos.push(p.x, p.y, p.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Quad decal lying on the road: centred at (s, d), size (w across, l along), rotated relRot about up.
function decal(route, s, d, w, l, y = 0.012, relRot = 0) {
  const g = new THREE.PlaneGeometry(w, l);
  g.rotateX(-Math.PI / 2);
  if (relRot) g.rotateY(relRot);
  const p = route.pos(s, d, y);
  const m = new THREE.Matrix4().makeRotationY(route.yaw(s)).setPosition(p.x, p.y, p.z);
  g.applyMatrix4(m);
  return g;
}

function placeMatrix(route, s, d, y = 0, rel = 0, scale = 1) {
  const p = route.pos(s, d, y);
  const m = new THREE.Matrix4().makeRotationY(route.yaw(s) + rel);
  if (scale !== 1) m.scale(new THREE.Vector3(scale, scale, scale));
  m.setPosition(p.x, p.y, p.z);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Lighting / atmosphere presets

const ATMOS = {
  day: { sky: ['#7fb2e5', '#cfe3f3', '#e9eef0'], hemi: ['#dfefff', '#4a5a3a', 0.85], sun: ['#fff4e0', 1.6], fog: ['#cfdde8', 120, 520], exposure: 1 },
  overcast: { sky: ['#9aa6b1', '#c4cbd1', '#d6dadd'], hemi: ['#e2e6ea', '#4b5246', 1.0], sun: ['#ffffff', 0.55], fog: ['#c3c9ce', 80, 420], exposure: 1 },
  rain: { sky: ['#6e7882', '#959ea7', '#a9b0b6'], hemi: ['#c6ccd2', '#3b4238', 0.85], sun: ['#ffffff', 0.3], fog: ['#8e979f', 40, 260], exposure: 1 },
  fog: { sky: ['#b9bfc4', '#c6cbcf', '#cdd1d4'], hemi: ['#d9dde0', '#55595a', 0.9], sun: ['#ffffff', 0.25], fog: ['#c2c7cb', 8, 95], exposure: 1 },
  dusk: { sky: ['#3d4a7a', '#d98a5a', '#f6c27a'], hemi: ['#f2c9a8', '#4a4236', 0.8], sun: ['#ffb36b', 1.1], fog: ['#c79478', 90, 430], exposure: 1 },
  night: { sky: ['#03060d', '#0a1222', '#18202c'], hemi: ['#5a6a90', '#151515', 0.3], sun: ['#7f93c4', 0.15], fog: ['#0c111a', 40, 260], exposure: 1 },
};

function skyDome(colors) {
  const g = new THREE.SphereGeometry(900, 24, 16);
  const top = new THREE.Color(colors[0]), mid = new THREE.Color(colors[1]), hor = new THREE.Color(colors[2]);
  const col = new Float32Array(g.attributes.position.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < g.attributes.position.count; i++) {
    const y = g.attributes.position.getY(i) / 900;
    if (y > 0.15) c.copy(mid).lerp(top, Math.min(1, (y - 0.15) / 0.6));
    else c.copy(hor).lerp(mid, Math.max(0, (y + 0.05) / 0.2));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = -10;
  return mesh;
}

// ---------------------------------------------------------------------------------------------

export function buildWorld(clip, { quality = 'auto' } = {}) {
  const r = rng(clip.seed ^ 0x5bd1e995);
  const route = new Route(clip.route.segments, clip.route.elev);
  const scene = new THREE.Scene();
  const night = clip.time === 'night';
  const dusk = clip.time === 'dusk';
  const atmosKey = night ? 'night' : dusk ? 'dusk' : clip.weather === 'fog' ? 'fog' : clip.weather === 'rain' ? 'rain' : clip.weather === 'overcast' ? 'overcast' : 'day';
  const A = ATMOS[atmosKey];
  const shadows = quality === 'high' || (quality === 'auto' && !night && atmosKey !== 'fog' && atmosKey !== 'rain');
  scene.background = new THREE.Color(A.fog[0]);
  scene.fog = new THREE.Fog(A.fog[0], A.fog[1], A.fog[2]);
  const sky = skyDome(A.sky);
  scene.add(sky);
  scene.add(new THREE.HemisphereLight(A.hemi[0], A.hemi[1], A.hemi[2]));
  const sun = new THREE.DirectionalLight(A.sun[0], A.sun[1]);
  const sunDir = new THREE.Vector3(dusk ? -0.3 : -0.45, dusk ? 0.18 : 0.8, dusk ? -1 : -0.35).normalize();
  sun.position.copy(sunDir).multiplyScalar(100);
  scene.add(sun);
  scene.add(sun.target);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 260;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
  }

  const wet = clip.weather === 'rain';
  const materials = {
    vc: new THREE.MeshLambertMaterial({ vertexColors: true }),
    tree: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    glass: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.6 }),
    hedge: new THREE.MeshLambertMaterial({ vertexColors: true, map: TX.hedgeTexture() }),
    brick: new THREE.MeshLambertMaterial({ vertexColors: true, map: TX.brickTexture('#b0b0b0') }),
    pavement: new THREE.MeshLambertMaterial({ vertexColors: true, map: TX.pavementTexture() }),
    grass: new THREE.MeshLambertMaterial({ vertexColors: true, map: TX.grassTexture() }),
    field: new THREE.MeshLambertMaterial({ vertexColors: true, map: TX.fieldTexture('#7d8f45') }),
    lamp: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: night || dusk ? '#ffcf7a' : '#000000', emissiveIntensity: night ? 1.2 : 0.4 }),
    litwin: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: night || dusk ? '#c88a40' : '#000000', emissiveIntensity: night ? 0.55 : 0.35 }),
    decal: new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    shopwin: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: night || dusk ? '#8a6a45' : '#000000', emissiveIntensity: night ? 0.5 : 0.25 }),
  };
  if (wet) {
    for (const k of ['pavement', 'grass']) materials[k].color = new THREE.Color('#9a9a9a');
  }
  const batch = new Batch();
  const extraMeshes = [];
  const animated = []; // functions (t) => void for beacons etc.
  const L = clip.layout;
  const S0 = -40, S1 = route.len + 260; // build a little behind the start and well beyond the end

  // ---- Road surfaces ---------------------------------------------------------------------
  const carriageways = L.carriageways || [{ d0: -L.road.width / 2, d1: L.road.width / 2, spec: L.road.spec }];
  for (const cw of carriageways) {
    const t = TX.roadTexture({ ...cw.spec, width: cw.d1 - cw.d0 }, wet);
    const m = new THREE.MeshLambertMaterial({ map: t, color: wet ? '#cfd2d6' : '#ffffff' });
    if (wet) { m.emissive = new THREE.Color('#0d0f12'); }
    const g = ribbon(route, S0, S1, cw.d0, cw.d1, 0, t.userData.period, 2, 'road');
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = shadows;
    scene.add(mesh);
    extraMeshes.push(mesh);
  }
  const roadL = Math.min(...carriageways.map((c) => c.d0));
  const roadR = Math.max(...carriageways.map((c) => c.d1));
  if (L.reservation) {
    const { d0, d1 } = L.reservation;
    batch.add('grass', ribbon(route, S0, S1, d0, d1, 0.05, 4), null, '#8aa06a', 0);
    // safety barrier
    for (const off of [d0 + 0.6, d1 - 0.6]) {
      batch.add('vc', wall(route, S0, S1, off, 0.45, 0.75, off < (d0 + d1) / 2 ? -1 : 1), null, '#a8adb2', 0);
      batch.add('vc', wall(route, S0, S1, off, 0.45, 0.75, off < (d0 + d1) / 2 ? 1 : -1), null, '#9ba0a5', 0);
    }
    for (let s = S0; s < S1; s += 4) {
      for (const off of [d0 + 0.6, d1 - 0.6]) batch.add('vc', new THREE.BoxGeometry(0.1, 0.75, 0.1), placeMatrix(route, s, off + (off < 0 ? 0.08 : -0.08), 0.375), '#6f7378', s);
    }
  }

  // gaps in kerbs/pavements for junctions
  const gaps = { '-1': [], '1': [] };
  for (const j of clip.junctions || []) gaps[j.side].push([j.s - j.width / 2 - 1.5, j.s + j.width / 2 + 1.5, j]);
  const spans = (side, a, b) => {
    const gs = gaps[side].slice().sort((x, y) => x[0] - y[0]);
    const out = [];
    let cur = a;
    for (const [g0, g1] of gs) { if (g1 < cur || g0 > b) continue; if (g0 > cur) out.push([cur, g0]); cur = Math.max(cur, g1); }
    if (cur < b) out.push([cur, b]);
    return out;
  };

  // ---- Roadside cross-sections -------------------------------------------------------------
  const sideInfo = {};
  for (const side of [-1, 1]) {
    const cfg = side < 0 ? L.left : L.right;
    const edge = side < 0 ? roadL : roadR;
    let d = edge;
    const info = { edge, pavementOuter: edge, back: cfg.back };
    for (const [a, b] of spans(side, S0, S1)) {
      let dd = edge;
      if (cfg.pavement) {
        const p0 = dd, p1 = dd + side * cfg.pavement;
        const [lo, hi] = side < 0 ? [p1, p0] : [p0, p1];
        batch.add('pavement', ribbon(route, a, b, lo, hi, 0.12, 2.4), null, wet ? '#8d8f91' : '#c9c9c4', a);
        batch.add('vc', wall(route, a, b, p0, 0, 0.12, -side), null, '#b9b9b4', a);
        dd = p1;
      }
      if (cfg.verge) {
        const v0 = dd, v1 = dd + side * cfg.verge;
        const [lo, hi] = side < 0 ? [v1, v0] : [v0, v1];
        batch.add('grass', ribbon(route, a, b, lo, hi, cfg.pavement ? 0.1 : 0.03, 3), null, '#9cae74', a);
        if (!cfg.pavement && cfg.kerb) batch.add('vc', wall(route, a, b, v0, 0, 0.1, -side), null, '#b5b5b0', a);
        dd = v1;
      }
      if (cfg.hardShoulder) { /* hard shoulder is part of the carriageway texture */ }
      d = dd;
    }
    info.pavementOuter = d;
    // ground beyond
    const g0 = d, g1 = d + side * 160;
    const [lo, hi] = side < 0 ? [g1, g0] : [g0, g1];
    const groundKey = cfg.back === 'field' || cfg.back === 'hedge' || cfg.back === 'embankment' ? 'field' : 'grass';
    batch.add(groundKey, ribbon(route, S0, S1, lo, hi, cfg.pavement ? 0.08 : 0.0, 6, 6), null, groundKey === 'field' ? ['#a8b66a', '#9fb15f', '#b9b06a'][r.int(0, 2)] : '#8faa6a', 0);
    sideInfo[side] = info;
  }

  // ---- Junction side roads -------------------------------------------------------------------
  for (const j of clip.junctions || []) {
    const side = j.side;
    const edge = sideInfo[side].edge;
    const len = j.len || 60;
    if (j.kind === 'drive' || j.kind === 'gate') {
      const d0 = edge, d1 = edge + side * (j.kind === 'gate' ? 6 : 8);
      const [lo, hi] = side < 0 ? [d1, d0] : [d0, d1];
      batch.add(j.kind === 'gate' ? 'vc' : 'pavement', ribbon(route, j.s - j.width / 2, j.s + j.width / 2, lo, hi, j.kind === 'gate' ? 0.02 : 0.1, 2), null, j.kind === 'gate' ? '#7a6a4a' : '#a9a59c', j.s);
      continue;
    }
    // side road surface built along d at fixed s range (junctions are only placed on straight sections)
    const w = j.width;
    const sideSpec = { width: w, centre: j.centre || 'dash', edge: 'none' };
    const t = TX.roadTexture(sideSpec, wet);
    const m = new THREE.MeshLambertMaterial({ map: t });
    const geo = new THREE.PlaneGeometry(w, len, 1, 1);
    geo.rotateX(-Math.PI / 2);
    // uv: repeat along length
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (len / t.userData.period));
    const mid = route.pos(j.s, edge + side * len / 2, 0.005);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(mid.x, mid.y, mid.z);
    mesh.rotation.y = route.yaw(j.s) + Math.PI / 2;
    mesh.receiveShadow = shadows;
    scene.add(mesh);
    extraMeshes.push(mesh);
    const cfg = side < 0 ? L.left : L.right;
    // side-road pavements
    if (cfg.pavement) {
      for (const sgn of [-1, 1]) {
        const g = new THREE.BoxGeometry(cfg.pavement, 0.12, len - cfg.pavement);
        const off = sgn * (w / 2 + cfg.pavement / 2);
        const p = route.pos(j.s + off, edge + side * (len / 2 + cfg.pavement / 2), 0.06);
        const mm = new THREE.Matrix4().makeRotationY(route.yaw(j.s) + Math.PI / 2).setPosition(p.x, p.y, p.z);
        const gg = g.clone(); gg.rotateY(Math.PI / 2);
        batch.add('pavement', gg, mm, wet ? '#8d8f91' : '#c9c9c4', j.s);
      }
    }
    // give way / stop line at the mouth
    if (j.giveWay !== false) {
      const lineD = edge + side * 0.6;
      const dashes = Math.floor(w / 2 / 0.9);
      for (let k = 0; k < dashes; k++) {
        const ds = j.s + (side < 0 ? 1 : -1) * (0.45 + k * 0.9);
        for (const dd of [0, side * 0.45]) batch.add('decal', decal(route, ds, lineD + dd, 0.25, 0.55, 0.011), null, '#e6e6e0', j.s);
      }
      if (j.triangle) batch.add('decal', decal(route, j.s + (side < 0 ? 1.6 : -1.6), edge + side * 6, 1.4, 2.6, 0.011), null, '#e6e6e0', j.s);
    }
  }

  // ---- Road markings and crossings ------------------------------------------------------------
  for (const c of clip.crossings || []) {
    const W = roadR - roadL;
    const stripes = Math.floor(W / 1.0);
    for (let k = 0; k < stripes; k++) {
      const dd = roadL + 0.5 + k * 1.0;
      batch.add('decal', decal(route, c.s, dd, 0.5, 3.2, 0.012), null, '#efefe8', c.s);
    }
    // zig-zags both sides of the crossing, along both kerbs and the centre
    for (const dir of [-1, 1]) {
      for (let k = 0; k < 8; k++) {
        const ss = c.s + dir * (3 + k * 2);
        for (const dd of [roadL + 0.35, roadR - 0.35]) {
          batch.add('decal', decal(route, ss, dd + (k % 2 ? 0.12 : -0.12), 0.1, 2.05, 0.012, k % 2 ? 0.22 : -0.22), null, '#efefe8', ss);
        }
      }
      // give way lines
      for (let k = 0; k < 9; k++) batch.add('decal', decal(route, c.s + dir * 2.3, roadL + 0.4 + k * ((W - 0.8) / 8), 0.5, 0.2, 0.012), null, '#efefe8', c.s);
    }
    // Belisha beacons
    for (const dd of [roadL - 0.5, roadR + 0.5]) {
      for (const dir of [-1, 1]) {
        const ss = c.s + dir * 2.2;
        for (let k = 0; k < 6; k++) batch.add('vc', new THREE.CylinderGeometry(0.06, 0.06, 0.45, 8), placeMatrix(route, ss, dd, 0.12 + 0.225 + k * 0.45), k % 2 ? '#111111' : '#f2f2f2', ss);
        const globeM = new THREE.MeshLambertMaterial({ color: '#d88a10', emissive: '#ff9a10', emissiveIntensity: 0.2 });
        const globe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), globeM);
        const p = route.pos(ss, dd, 2.95);
        globe.position.set(p.x, p.y, p.z);
        scene.add(globe);
        extraMeshes.push(globe);
        animated.push((t) => { globeM.emissiveIntensity = Math.floor(t * 1.6) % 2 ? 1.4 : 0.15; });
      }
    }
  }
  for (const m of clip.markings || []) {
    if (m.text) {
      const t = TX.textDecal(m.text, m.color || '#efefe8');
      const mt = new THREE.MeshLambertMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
      const g = decal(route, m.s, m.d, m.w || 2.4, m.l || 5, 0.013, 0);
      const mesh = new THREE.Mesh(g, mt);
      scene.add(mesh);
      extraMeshes.push(mesh);
    }
    if (m.box) { // bus stop box
      const [len, wid] = [m.len || 25, m.wid || 2.6];
      const dd = m.d;
      batch.add('decal', decal(route, m.s, dd - wid / 2, 0.12, len, 0.012), null, '#e5c21a', m.s);
      batch.add('decal', decal(route, m.s, dd + wid / 2, 0.12, len, 0.012), null, '#e5c21a', m.s);
      batch.add('decal', decal(route, m.s - len / 2, dd, wid, 0.12, 0.012), null, '#e5c21a', m.s);
      batch.add('decal', decal(route, m.s + len / 2, dd, wid, 0.12, 0.012), null, '#e5c21a', m.s);
    }
    if (m.yellow) { // double yellow lines from s0 to s1 at d
      for (const off of [0, m.yellow * 0.18]) batch.add('decal', ribbon(route, m.s0, m.s1, m.d + off - 0.05, m.d + off + 0.05, 0.012, 1), null, '#e5c21a', m.s0);
    }
  }

  // ---- Scenery along each side ------------------------------------------------------------------
  const blocked = (side, s, margin = 0) => {
    for (const [g0, g1] of gaps[side]) if (s > g0 - margin && s < g1 + margin) return true;
    for (const z of clip.noScenery || []) if ((z[2] == null || z[2] === side) && s > z[0] - margin && s < z[1] + margin) return true;
    for (const c of clip.crossings || []) if (Math.abs(s - c.s) < 3 + margin) return true;
    return false;
  };
  const scenery = new Scenery(route, batch, r, { night, dusk, wet, materials, scene, extraMeshes, sideInfo, blocked });
  for (const side of [-1, 1]) {
    const cfg = side < 0 ? L.left : L.right;
    scenery.side(side, cfg, S0, S1, clip.env);
  }
  if (L.lamps) scenery.lamps(L.lamps, S0, S1);
  for (const b of clip.busStops || []) scenery.busStop(b);
  for (const sg of clip.signs || []) scenery.sign(sg);
  for (const p of clip.parked || []) {
    const car = p.type === 'van' ? M.makeCar({ color: p.color, style: 'van', parts: false }) : M.makeCar({ color: p.color, style: p.style || 'hatch', parts: false });
    batch.addObject('vc', car, placeMatrix(route, p.s, p.d, p.y || 0, p.flip ? Math.PI : 0), p.s);
  }
  if (clip.env === 'rural' || clip.env === 'village' || clip.env === 'motorway' || clip.env === 'dual') scenery.hills(S0, S1);

  const statics = batch.build(materials, scene, { shadows });

  // ---- Dynamic actors ---------------------------------------------------------------------------
  const actors = (clip.actors || []).map((a) => makeActor(a, route, scene, { night, dusk, fog: clip.weather === 'fog', rain: wet, shadows }));

  // ---- Ego camera -------------------------------------------------------------------------------
  const ego = new SpeedProfile(clip.ego.speeds, clip.ego.s0 || 0, clip.duration + 5);
  const egoLat = new Track(clip.ego.lat && clip.ego.lat.length ? clip.ego.lat : [[0, clip.ego.d || -1.8]]);
  const camera = new THREE.PerspectiveCamera(clip.fov || 52, 16 / 9, 0.1, 1000);
  scene.add(camera);
  let headlights = null;
  if (night || dusk || clip.weather === 'fog') {
    headlights = new THREE.SpotLight('#fff6e0', night ? 40 : 14, night ? 110 : 70, 0.62, 0.45, 0.9);
    headlights.position.set(0, -0.5, 0.5);
    camera.add(headlights);
    const tgt = new THREE.Object3D();
    tgt.position.set(0, -2.2, -20);
    camera.add(tgt);
    headlights.target = tgt;
  }
  // rain streaks
  let rain = null;
  if (wet) {
    const n = 900;
    const pos = new Float32Array(n * 6);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#c8d2dc', transparent: true, opacity: 0.35, fog: false }));
    rain.frustumCulled = false;
    rain.userData.seed = Array.from({ length: n }, () => [r.range(-8, 8), r.range(-1, 6), r.range(-22, -1.5), r.range(0, 1)]);
    camera.add(rain);
  }

  const look = new THREE.Vector3();
  const lat = [];
  function egoState(t) {
    const s = ego.s(t);
    egoLat.at(t, lat);
    return { s, d: lat[0], v: ego.v(t) };
  }

  function update(t) {
    const { s, d, v } = egoState(t);
    const driver = d + 0.38;
    const bob = Math.sin(t * 11) * 0.004 * Math.min(1, v / 10) + Math.sin(t * 2.3) * 0.003;
    const p = route.pos(s, driver, 1.2 + bob);
    camera.position.set(p.x, p.y, p.z);
    const ahead = 9 + Math.min(18, v * 0.9);
    // look along the road, following the lane we're heading for
    const futT = t + ahead / Math.max(4, v);
    egoLat.at(futT, lat);
    const q = route.pos(s + ahead, lat[0] + 0.38, 1.2 + route.grade(s) * 2 - 0.18);
    look.set(q.x, q.y, q.z);
    camera.lookAt(look);
    camera.rotateZ(-route.curvature(s) * v * 0.15); // slight roll in bends
    sky.position.copy(camera.position);
    if (shadows) {
      const c = route.pos(s + 25, 0, 0);
      sun.target.position.set(c.x, c.y, c.z);
      sun.position.set(c.x + sunDir.x * 120, c.y + sunDir.y * 120, c.z + sunDir.z * 120);
    }
    for (const a of actors) a.update(t, s);
    for (const f of animated) f(t);
    if (rain) {
      const arr = rain.geometry.attributes.position.array;
      const seeds = rain.userData.seed;
      for (let i = 0; i < seeds.length; i++) {
        const [x, y0, z, ph] = seeds[i];
        const y = 6 - (((t * 9 + ph * 7) % 7) + 7) % 7;
        const zz = z + ((v * t * 0.0) % 1);
        arr.set([x, y + y0 * 0 - 1, zz, x + 0.01, y - 1 - 0.35, zz + 0.25], i * 6);
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }
  }

  function dispose() {
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  }

  return { scene, camera, update, dispose, route, ego, egoState, shadows, statics, atmos: atmosKey, rain: wet, actors };
}

// ---------------------------------------------------------------------------------------------

class Scenery {
  constructor(route, batch, r, env) {
    this.route = route; this.batch = batch; this.r = r; this.env = env;
  }

  side(side, cfg, S0, S1, envName) {
    const back = cfg.back;
    const d0 = this.env.sideInfo[side].pavementOuter;
    if (back === 'houses') this.houses(side, d0, S0, S1, cfg);
    else if (back === 'shops') this.shops(side, d0, S0, S1, cfg);
    else if (back === 'hedge') this.hedges(side, d0, S0, S1, cfg);
    else if (back === 'embankment') this.embankment(side, d0, S0, S1, cfg);
    else if (back === 'cottages') this.cottages(side, d0, S0, S1, cfg);
    else if (back === 'park') this.park(side, d0, S0, S1, cfg);
  }

  m(s, d, y = 0, rel = 0) { return placeMatrix(this.route, s, d, y, rel); }

  house(s, d, side, { w = 6, depth = 8, h = 5.6, color, roof = '#5b3a32', garden = 4, terraceEnd = true, lit = false }) {
    const B = this.batch, r = this.r;
    const face = side < 0 ? Math.PI / 2 : -Math.PI / 2; // front faces the road
    const dc = d + side * (garden + depth / 2);
    const base = this.m(s, dc, 0, face);
    const add = (key, geo, x, y, z, color) => {
      const g = geo.clone();
      g.translate(x, y, z);
      B.add(key, g, base, color, s);
    };
    // local: x along the road (width), z towards the road (front), y up
    const body = new THREE.BoxGeometry(w, h, depth);
    add('brick', body, 0, h / 2, 0, color);
    // pitched roof (ridge along x)
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-depth / 2 - 0.3, 0); roofShape.lineTo(depth / 2 + 0.3, 0); roofShape.lineTo(0, 2.6); roofShape.closePath();
    const rg = new THREE.ExtrudeGeometry(roofShape, { depth: w + 0.2, bevelEnabled: false });
    rg.translate(0, 0, -(w + 0.2) / 2);
    rg.rotateY(Math.PI / 2);
    add('vc', rg, 0, h, 0, roof);
    if (r.chance(0.6)) add('vc', new THREE.BoxGeometry(0.7, 1.4, 0.7), w / 2 - 0.6, h + 1.8, -0.8, color);
    // windows and door on the front
    const winGeo = new THREE.BoxGeometry(1.2, 1.2, 0.08);
    const frame = new THREE.BoxGeometry(1.36, 1.36, 0.06);
    const zf = depth / 2 + 0.03;
    const doorX = r.chance(0.5) ? -w / 2 + 1.2 : w / 2 - 1.2;
    const winsX = [doorX < 0 ? w / 2 - 1.6 : -w / 2 + 1.6];
    for (const y of [1.6, 4.1]) {
      for (const x of y > 2 ? [-w / 4, w / 4] : winsX) {
        add('vc', frame, x, y, zf - 0.01, '#f0f0ea');
        add(lit && r.chance(0.5) ? 'litwin' : 'vc', winGeo, x, y, zf + 0.01, '#2a3540');
      }
    }
    add('vc', new THREE.BoxGeometry(1.0, 2.1, 0.1), doorX, 1.05, zf, ['#1f3a5f', '#6b1f1f', '#1f4a2f', '#222222', '#e8e8e8'][r.int(0, 4)]);
  }

  houses(side, d0, S0, S1, cfg) {
    const r = this.r;
    const palette = ['#a35a3c', '#8e4b34', '#b8705a', '#c9b79c', '#e8e2d4', '#9c6b4e', '#d2c3a5'];
    const roofs = ['#4f3a33', '#3e3e44', '#5d4237', '#33363b'];
    let s = S0 + r.range(0, 6);
    const lit = this.env.night || this.env.dusk;
    while (s < S1) {
      const terrace = r.chance(cfg.terrace ?? 0.5);
      const count = terrace ? r.int(3, 6) : 2;
      const w = terrace ? r.range(4.8, 5.6) : r.range(6, 7.5);
      const len = count * w;
      if (this.blockedRange(side, s, s + len)) { s += 4; continue; }
      const color = r.pick(palette), roof = r.pick(roofs);
      const garden = cfg.garden ?? r.range(3, 6);
      for (let i = 0; i < count; i++) {
        this.house(s + w / 2 + i * w, d0, side, { w, depth: r.range(7.5, 9), h: r.range(5.4, 6.2), color: terrace ? color : r.pick(palette), roof, garden, lit });
      }
      // front boundary: low wall or hedge with gate gaps
      const hedge = r.chance(0.45);
      for (let i = 0; i < count; i++) {
        const a = s + i * w + 1.0, b = s + (i + 1) * w;
        const g = new THREE.BoxGeometry(0.3, hedge ? 1.0 : 0.65, b - a);
        g.translate(0, hedge ? 0.5 : 0.33, 0);
        this.batch.add(hedge ? 'hedge' : 'brick', g, this.m((a + b) / 2, d0 + side * 0.2, 0.08), hedge ? '#6f8f4f' : '#9e5a40', a);
        if (r.chance(cfg.driveCars ?? 0.15)) {
          const car = M.makeCar({ color: r.pick(M.CAR_COLOURS), style: r.pick(['hatch', 'saloon', 'estate', 'suv']), parts: false });
          this.batch.addObject('vc', car, this.m((a + b) / 2, d0 + side * (garden * 0.55 + 0.6), 0.08, side < 0 ? Math.PI / 2 : -Math.PI / 2), a);
        }
      }
      if (r.chance(0.35) && !this.env.blocked(side, s + len + 2)) this.tree(s + len + 1.5, d0 + side * r.range(2, 4));
      s += len + (terrace ? r.range(1, 3) : r.range(2.5, 5));
    }
  }

  shops(side, d0, S0, S1, cfg) {
    const r = this.r;
    const names = ['CAFÉ', 'NEWSAGENT', 'PHARMACY', 'BAKERY', 'BOOKS', 'FLORIST', 'BARBER', 'BUTCHER', 'TAKEAWAY', 'HARDWARE', 'ESTATE AGENT', 'LAUNDERETTE', 'OPTICIAN', 'DELI', 'GIFTS', 'POST OFFICE'];
    const fronts = [['#1d3b2a', '#f2e6c8'], ['#5a1a1a', '#f6f0e0'], ['#1f2f4f', '#ffffff'], ['#111111', '#d8b45a'], ['#e8e2d0', '#20304a'], ['#2f5f5f', '#ffffff']];
    const walls = ['#b8705a', '#d8cbb0', '#e9e4d8', '#9e5a40', '#c4b49a', '#f1ede4'];
    let s = S0 + r.range(0, 3);
    while (s < S1) {
      const w = r.range(6, 10);
      if (this.blockedRange(side, s, s + w)) { s += 3; continue; }
      const h = r.range(7.5, 11.5);
      const depth = 10;
      const face = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      const base = this.m(s + w / 2, d0 + side * (depth / 2), 0.12, face);
      const add = (key, geo, x, y, z, col) => { const g = geo.clone(); g.translate(x, y, z); this.batch.add(key, g, base, col, s); };
      const wc = r.pick(walls);
      add('brick', new THREE.BoxGeometry(w, h, depth), 0, h / 2, 0, wc);
      const [bg, fg] = r.pick(fronts);
      add('vc', new THREE.BoxGeometry(w - 0.3, 0.7, 0.2), 0, 3.4, depth / 2 + 0.1, bg);
      add(this.env.night || this.env.dusk ? (r.chance(0.6) ? 'shopwin' : 'vc') : 'vc', new THREE.BoxGeometry(w - 2.4, 2.4, 0.1), 0.6, 1.6, depth / 2 + 0.05, '#2a3846');
      add('vc', new THREE.BoxGeometry(1.0, 2.3, 0.12), -w / 2 + 0.9, 1.15, depth / 2 + 0.06, bg);
      for (const x of [-w / 4, w / 4]) for (const y of [5.2, h > 9.5 ? 8 : null]) {
        if (y == null) continue;
        add('vc', new THREE.BoxGeometry(1.4, 1.5, 0.08), x, y, depth / 2 + 0.04, '#26313b');
        add('vc', new THREE.BoxGeometry(1.55, 1.65, 0.05), x, y, depth / 2 + 0.02, '#efefe8');
      }
      // flat roof parapet
      add('vc', new THREE.BoxGeometry(w, 0.4, depth), 0, h + 0.2, 0, '#6d6d6d');
      // sign text
      const name = r.pick(names);
      const t = TX.shopSignTexture(name, bg, fg);
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 0.6, 5.5), 0.6), new THREE.MeshLambertMaterial({ map: t }));
      const p = this.route.pos(s + w / 2, d0 + side * (-0.22), 3.52);
      sm.position.set(p.x, p.y, p.z);
      sm.rotation.y = this.route.yaw(s + w / 2) + face;
      this.env.scene.add(sm);
      this.env.extraMeshes.push(sm);
      if (r.chance(0.25)) add('vc', new THREE.BoxGeometry(0.5, 0.9, 0.5), r.range(-w / 3, w / 3), 0.45, depth / 2 + 1.5, '#2e4a2e'); // bin
      s += w;
    }
  }

  hedges(side, d0, S0, S1, cfg) {
    const r = this.r;
    let s = S0;
    const segLen = 8;
    while (s < S1) {
      if (this.env.blocked(side, s + segLen / 2, 1)) { s += 2; continue; }
      if (r.chance(cfg.gateways ?? 0.03)) { this.gate(s, d0 + side * 0.4, side); s += 5; continue; }
      const h = (cfg.hedgeH || 1.8) + r.range(-0.25, 0.35);
      const g = new THREE.BoxGeometry(1.2 + r.range(0, 0.4), h, segLen + 0.3);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 1.2);
      g.translate(0, h / 2, 0);
      this.batch.add('hedge', g, this.m(s + segLen / 2, d0 + side * 0.9, 0), ['#6f8f4f', '#5f7f45', '#7a9455'][r.int(0, 2)], s);
      if (r.chance(cfg.trees ?? 0.25)) this.tree(s + r.range(0, segLen), d0 + side * r.range(2.5, 6), r.range(0.9, 1.5));
      if (r.chance(0.08)) this.pole(s, d0 + side * 1.8);
      s += segLen;
    }
    // occasional cottages and farm buildings well back from the road
    for (let s2 = S0 + r.range(50, 150); s2 < S1; s2 += r.range(120, 260)) {
      if (this.blockedRange(side, s2 - 6, s2 + 6)) continue;
      this.house(s2, d0 + side * 1.5, side, { w: r.range(7, 10), depth: 7, h: r.range(4.5, 5.5), color: r.pick(['#e8e2d4', '#d8cbb0', '#c9b79c', '#b8705a']), roof: r.pick(['#3e3e44', '#4f3a33']), garden: r.range(8, 18), lit: this.env.night || this.env.dusk });
    }
  }

  cottages(side, d0, S0, S1, cfg) {
    const r = this.r;
    let s = S0;
    while (s < S1) {
      if (r.chance(0.55)) {
        const w = r.range(6, 9);
        if (!this.blockedRange(side, s, s + w)) {
          this.house(s + w / 2, d0, side, { w, depth: 7, h: r.range(4.6, 5.8), color: r.pick(['#e8e2d4', '#d8cbb0', '#c9b79c', '#b8705a', '#f1ede4']), roof: r.pick(['#3e3e44', '#4f3a33', '#6b5a3a']), garden: r.range(1.5, 4), lit: this.env.night || this.env.dusk });
          const g = new THREE.BoxGeometry(0.35, 0.8, w - 1.2);
          g.translate(0, 0.4, 0);
          this.batch.add('brick', g, this.m(s + w / 2 + 0.6, d0 + side * 0.2, 0.08), '#b9ad98', s);
        }
        s += w + r.range(1, 4);
      } else {
        const len = r.range(8, 20);
        if (!this.blockedRange(side, s, s + len)) {
          const g = new THREE.BoxGeometry(1.1, 1.6, len);
          g.translate(0, 0.8, 0);
          this.batch.add('hedge', g, this.m(s + len / 2, d0 + side * 0.7, 0.05), '#6f8f4f', s);
          if (r.chance(0.5)) this.tree(s + len / 2, d0 + side * r.range(3, 6));
        }
        s += len;
      }
    }
  }

  park(side, d0, S0, S1, cfg) {
    const r = this.r;
    for (let s = S0; s < S1; s += 2.5) {
      if (this.env.blocked(side, s)) continue;
      this.batch.add('vc', new THREE.BoxGeometry(0.05, 1.1, 0.05), this.m(s, d0 + side * 0.3, 0.55), '#1d1d1d', s);
    }
    this.batch.add('vc', wall(this.route, S0, S1, d0 + side * 0.3, 0.95, 1.0, -side), null, '#1d1d1d', 0);
    for (let s = S0 + r.range(0, 10); s < S1; s += r.range(9, 18)) this.tree(s, d0 + side * r.range(3, 12), r.range(1, 1.6));
  }

  embankment(side, d0, S0, S1, cfg) {
    const r = this.r;
    // rising grassy bank with scattered trees, marker posts at the edge
    const bank = ribbon(this.route, S0, S1, side < 0 ? d0 - 18 : d0 + 4, side < 0 ? d0 - 4 : d0 + 18, 0, 6, 6);
    const pos = bank.attributes.position;
    // lift outer edge
    for (let i = 0; i < pos.count; i++) {
      // ribbon vertices alternate inner/outer; approximate by distance from road centre in XZ is hard — use index parity
    }
    this.batch.add('grass', bank, new THREE.Matrix4().makeTranslation(0, 0.05, 0), '#8faa6a', 0);
    for (let s = S0; s < S1; s += 50) {
      this.batch.add('vc', new THREE.BoxGeometry(0.12, 1.0, 0.12), this.m(s, d0 + side * 1.0, 0.5), '#f0f0f0', s);
      this.batch.add('vc', new THREE.BoxGeometry(0.13, 0.15, 0.13), this.m(s, d0 + side * 1.0, 0.85), side < 0 ? '#c01818' : '#e0a000', s);
    }
    for (let s = S0 + r.range(0, 20); s < S1; s += r.range(8, 30)) this.tree(s, d0 + side * r.range(9, 30), r.range(1.1, 1.8));
  }

  tree(s, d, scale = 1) {
    const r = this.r;
    const base = this.m(s, d, 0);
    const trunk = new THREE.CylinderGeometry(0.16 * scale, 0.22 * scale, 3 * scale, 7);
    trunk.translate(0, 1.5 * scale, 0);
    this.batch.add('vc', trunk, base, '#5a4632', s);
    const greens = this.env.dusk ? ['#4d5a2e', '#5a6332'] : ['#4f7a35', '#5c8a3c', '#3f6a30', '#6b8f3f', '#557a2e'];
    for (let k = 0; k < 3; k++) {
      const c = new THREE.IcosahedronGeometry(r.range(1.4, 2.2) * scale, 1);
      c.translate(r.range(-0.8, 0.8) * scale, (3.4 + r.range(0, 1.4)) * scale, r.range(-0.8, 0.8) * scale);
      this.batch.add('tree', c, base, r.pick(greens), s);
    }
  }

  pole(s, d) {
    const g = new THREE.CylinderGeometry(0.11, 0.14, 8, 6);
    g.translate(0, 4, 0);
    this.batch.add('vc', g, this.m(s, d, 0), '#5a4a3a', s);
    this.batch.add('vc', new THREE.BoxGeometry(1.2, 0.1, 0.1), this.m(s, d, 7.6), '#5a4a3a', s);
  }

  gate(s, d, side) {
    for (let k = 0; k < 5; k++) {
      this.batch.add('vc', new THREE.BoxGeometry(0.05, 0.05, 3.2), this.m(s + 2.5, d + side * 2.5, 0.3 + k * 0.25), '#8a8f94', s);
    }
    this.batch.add('vc', new THREE.BoxGeometry(0.15, 1.4, 0.15), this.m(s + 0.8, d + side * 2.5, 0.7), '#6a5a45', s);
    this.batch.add('vc', new THREE.BoxGeometry(0.15, 1.4, 0.15), this.m(s + 4.2, d + side * 2.5, 0.7), '#6a5a45', s);
  }

  lamps(cfg, S0, S1) {
    const { spacing = 34, sides = [-1, 1], offset = 0.5 } = cfg;
    let k = 0;
    for (let s = S0 + 10; s < S1; s += spacing, k++) {
      const side = sides[k % sides.length];
      if (this.env.blocked(side, s, 2)) continue;
      const d = this.env.sideInfo[side].edge + side * offset;
      const base = this.m(s, d, 0.12);
      const pole = new THREE.CylinderGeometry(0.07, 0.1, 7.5, 7);
      pole.translate(0, 3.75, 0);
      this.batch.add('vc', pole, base, '#5d6166', s);
      const arm = new THREE.BoxGeometry(1.4, 0.08, 0.1);
      arm.translate(-side * 0.7, 7.45, 0);
      this.batch.add('vc', arm, base, '#5d6166', s);
      const head = new THREE.BoxGeometry(0.5, 0.15, 0.25);
      head.translate(-side * 1.35, 7.35, 0);
      this.batch.add('lamp', head, base, '#d8d6cc', s);
      if (this.env.night || this.env.dusk) {
        // a pool of light on the road beneath
        const pool = new THREE.Mesh(new THREE.CircleGeometry(5.5, 20), new THREE.MeshBasicMaterial({ map: TX.glowTexture('255,190,110'), transparent: true, opacity: this.env.night ? 0.35 : 0.15, depthWrite: false, blending: THREE.AdditiveBlending }));
        pool.rotation.x = -Math.PI / 2;
        const p = this.route.pos(s, d - side * 2.5, 0.03);
        pool.position.set(p.x, p.y, p.z);
        this.env.scene.add(pool);
        this.env.extraMeshes.push(pool);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glowTexture('255,205,140'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
        const gp = this.route.pos(s, d - side * 1.35, 7.25);
        glow.position.set(gp.x, gp.y, gp.z);
        glow.scale.set(2.2, 2.2, 1);
        this.env.scene.add(glow);
        this.env.extraMeshes.push(glow);
      }
    }
  }

  busStop(b) {
    const side = b.side;
    const d = this.env.sideInfo[side].edge + side * 0.4;
    const pole = new THREE.CylinderGeometry(0.05, 0.05, 2.8, 6);
    pole.translate(0, 1.4, 0);
    this.batch.add('vc', pole, this.m(b.s + 6, d, 0.12), '#6a6a6a', b.s);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshLambertMaterial({ map: TX.plateTexture(['BUS', 'STOP'], { bg: '#ffffff', fg: '#c01818', border: '#c01818' }), side: THREE.DoubleSide }));
    const p = this.route.pos(b.s + 6, d - side * 0.3, 2.5);
    flag.position.set(p.x, p.y, p.z);
    flag.rotation.y = this.route.yaw(b.s) + Math.PI / 2;
    this.env.scene.add(flag);
    this.env.extraMeshes.push(flag);
    if (b.shelter !== false) {
      const sd = this.env.sideInfo[side].pavementOuter - side * 0.9;
      const base = this.m(b.s, sd, 0.12, side < 0 ? Math.PI / 2 : -Math.PI / 2);
      const add = (key, geo, x, y, z, col) => { const g = geo.clone(); g.translate(x, y, z); this.batch.add(key, g, base, col, b.s); };
      add('glass', new THREE.BoxGeometry(4, 2.2, 0.05), 0, 1.1, -0.6, '#9fb6c4');
      add('glass', new THREE.BoxGeometry(0.05, 2.2, 1.2), -2, 1.1, 0, '#9fb6c4');
      add('vc', new THREE.BoxGeometry(4.2, 0.1, 1.5), 0, 2.3, 0, '#3b3f44');
      add('vc', new THREE.BoxGeometry(2.0, 0.08, 0.35), 0.6, 0.5, -0.35, '#5a5f66');
    }
  }

  sign(sg) {
    const side = sg.side;
    const d = sg.d ?? (this.env.sideInfo[side].edge + side * 0.7);
    const h = sg.h || 2.1;
    const size = sg.size || 0.75;
    const pole = new THREE.CylinderGeometry(0.04, 0.04, h + size / 2, 6);
    pole.translate(0, (h + size / 2) / 2, 0);
    this.batch.add('vc', pole, this.m(sg.s, d, 0.12), '#8c9196', sg.s);
    let t;
    if (sg.speed) t = TX.speedSign(sg.speed);
    else if (sg.img) t = TX.signTexture(sg.img);
    else if (sg.plate) t = TX.plateTexture(sg.plate);
    const aspect = sg.aspect || 1;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size * aspect, size), new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, emissive: this.env.night ? '#202020' : '#000000' }));
    const p = this.route.pos(sg.s, d, 0.12 + h + size / 2);
    mesh.position.set(p.x, p.y, p.z);
    mesh.rotation.y = this.route.yaw(sg.s) + (sg.facing === 'away' ? Math.PI : 0) + side * -0.15;
    this.env.scene.add(mesh);
    this.env.extraMeshes.push(mesh);
    if (sg.plateBelow) {
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(size * 1.1, size * 0.45), new THREE.MeshLambertMaterial({ map: TX.plateTexture(sg.plateBelow), side: THREE.DoubleSide }));
      const pp = this.route.pos(sg.s, d, 0.12 + h - size * 0.3);
      pm.position.set(pp.x, pp.y, pp.z);
      pm.rotation.y = mesh.rotation.y;
      this.env.scene.add(pm);
      this.env.extraMeshes.push(pm);
    }
  }

  hills(S0, S1) {
    const r = this.r;
    for (let k = 0; k < 14; k++) {
      const s = r.range(S0, S1 + 300);
      const side = r.chance(0.5) ? -1 : 1;
      const d = side * r.range(180, 420);
      const g = new THREE.ConeGeometry(r.range(120, 260), r.range(25, 60), 10, 1);
      g.translate(0, 0, 0);
      this.batch.add('tree', g, this.m(s, d, -2), ['#7d9a5a', '#6f8c50', '#86a062'][r.int(0, 2)], Math.max(0, s));
    }
  }

  blockedRange(side, a, b) {
    for (let s = a; s <= b; s += 2) if (this.env.blocked(side, s)) return true;
    return this.env.blocked(side, b);
  }
}

// ---------------------------------------------------------------------------------------------
// Actors

const MAKERS = {
  car: (o, rnd) => M.makeCar({ color: o.color || M.CAR_COLOURS[Math.floor(rnd() * M.CAR_COLOURS.length)], style: o.style || 'hatch' }),
  van: (o, rnd) => M.makeCar({ color: o.color || '#f2f2f0', style: 'van' }),
  bus: (o) => M.makeBus(o),
  lorry: (o) => M.makeLorry(o),
  tractor: (o) => M.makeTractor(o),
  person: (o, rnd) => M.makePerson({ ...o, rnd }),
  child: (o, rnd) => M.makePerson({ ...o, child: true, rnd }),
  cyclist: (o, rnd) => M.makeCyclist({ ...o, rnd }),
  motorbike: (o, rnd) => M.makeMotorbike({ ...o, rnd }),
  horse: (o, rnd) => M.makeHorse({ ...o, rnd }),
  dog: (o, rnd) => M.makeDog({ ...o, rnd }),
  deer: (o, rnd) => M.makeDeer({ ...o, rnd }),
  ball: () => M.makeBall(),
  pushchair: (o, rnd) => M.makePushchair({ rnd }),
};

function makeActor(def, route, scene, env) {
  const rnd = rng(def.seed || 1);
  const obj = MAKERS[def.type](def.opts || {}, rnd);
  const parts = obj.userData.parts || {};
  if (env.shadows) obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(obj);
  const track = new Track(def.keys);
  // Precompute heading and distance travelled at 0.05 s steps, so playback is a pure function of t.
  const dt = 0.05;
  const t0 = track.t0 - 0.5, t1 = Math.max(track.t1, track.t0) + 0.5;
  const n = Math.ceil((t1 - t0) / dt) + 1;
  const yawTab = new Float32Array(n), distTab = new Float32Array(n), spdTab = new Float32Array(n);
  const a = [], b = [];
  const P = { x: 0, y: 0, z: 0 }, Q = { x: 0, y: 0, z: 0 };
  let dist = 0;
  const yaw0 = route.yaw(def.keys[0][1], def.yaw0 || 0);
  let lastYaw = yaw0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * dt;
    track.at(t, a); track.at(t + dt, b);
    route.pos(a[0], a[1], 0, P); route.pos(b[0], b[1], 0, Q);
    const dx = Q.x - P.x, dz = Q.z - P.z;
    const step = Math.hypot(dx, dz);
    if (step > 0.004) {
      let y = Math.atan2(-dx, -dz);
      if (within(def.rev, t)) y += Math.PI;
      lastYaw = y;
    }
    yawTab[i] = lastYaw;
    distTab[i] = dist;
    spdTab[i] = step / dt;
    dist += step;
  }
  // fill leading stationary period with the first moving heading (or the given initial heading)
  let firstMove = yawTab.findIndex((y, i) => i > 0 && spdTab[i] > 0.08);
  if (def.yaw0 != null || firstMove < 0) {
    for (let i = 0; i < n && spdTab[i] <= 0.08; i++) yawTab[i] = yaw0;
  } else {
    for (let i = 0; i < firstMove; i++) yawTab[i] = yawTab[firstMove];
  }
  // smooth heading changes
  for (let pass = 0; pass < 2; pass++) for (let i = 1; i < n - 1; i++) {
    const d1 = angDiff(yawTab[i - 1], yawTab[i]), d2 = angDiff(yawTab[i + 1], yawTab[i]);
    yawTab[i] = yawTab[i] + (d1 + d2) / 4;
  }
  const lookup = (tab, t) => {
    const f = Math.max(0, Math.min(n - 1.001, (t - t0) / dt));
    const i = Math.floor(f);
    return tab[i] + (tab[i + 1] - tab[i]) * (f - i);
  };
  const lookupAng = (t) => {
    const f = Math.max(0, Math.min(n - 1.001, (t - t0) / dt));
    const i = Math.floor(f);
    return yawTab[i] + angDiff(yawTab[i + 1], yawTab[i]) * (f - i);
  };
  const L = parts.lights;
  const lightsOn = env.night || env.dusk || env.fog || env.rain || def.headlights;
  const glows = [];
  if (L && lightsOn && L.head.length) {
    const len = parts.length || 4, wid = parts.width || 1.8;
    for (const sx of [-1, 1]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glowTexture('255,245,220'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: env.night ? 0.9 : 0.5 }));
      sp.position.set(sx * (wid / 2 - 0.3), 0.75, -len / 2 - 0.15);
      sp.scale.set(env.night ? 1.6 : 1.1, env.night ? 1.6 : 1.1, 1);
      obj.add(sp);
      glows.push(sp);
    }
  }
  const out = [];
  const pos = { x: 0, y: 0, z: 0 };
  return {
    def, obj,
    update(t, egoS) {
      const vis = def.visible ? within(def.visible, t) : true;
      obj.visible = vis;
      if (!vis) return;
      track.at(t, out);
      route.pos(out[0], out[1], def.y || 0, pos);
      obj.position.set(pos.x, pos.y, pos.z);
      obj.rotation.y = lookupAng(t);
      const dist = lookup(distTab, t);
      const spd = lookup(spdTab, t);
      if (parts.wheels) {
        const ang = -dist / (parts.wheelR || 0.32);
        for (const w of parts.wheels) w.rotation.x = ang;
      }
      if (parts.legL) { // person or cyclist
        if (parts.pedal) {
          const ph = dist / 2.1 * Math.PI * 2;
          parts.legL.rotation.x = -0.9 + Math.sin(ph) * 0.55;
          parts.legR.rotation.x = -0.9 - Math.sin(ph) * 0.55;
        } else {
          const ph = (dist / parts.stride) * Math.PI * 2;
          const amp = Math.min(1, spd / 1.2) * (spd > 2.2 ? 0.75 : 0.5);
          parts.legL.rotation.x = Math.sin(ph) * amp;
          parts.legR.rotation.x = -Math.sin(ph) * amp;
          parts.armL.rotation.x = -Math.sin(ph) * amp * 0.8;
          parts.armR.rotation.x = Math.sin(ph) * amp * 0.8;
        }
      }
      if (parts.legs) {
        const ph = (dist / parts.stride) * Math.PI * 2;
        const amp = Math.min(0.5, spd * 0.25);
        parts.legs.forEach((l, i) => { l.rotation.x = Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * amp; });
      }
      if (parts.ball) parts.ball.rotation.x = -dist / 0.11;
      if (parts.head && def.look) {
        const lk = def.look.find(([a0, a1]) => t >= a0 && t <= a1);
        parts.head.rotation.y = lk ? (lk[2] ?? 1.1) * Math.sin(Math.min(1, (t - lk[0]) / 0.4) * Math.PI / 2) : 0;
      }
      if (obj.userData.door && def.door) {
        const dr = def.door.find(([a0]) => t >= a0);
        if (dr) {
          const k = Math.min(1, (t - dr[0]) / 1.2) * (dr[1] && t > dr[1] ? Math.max(0, 1 - (t - dr[1]) / 1.0) : 1);
          obj.userData.door.visible = true;
          obj.userData.door.rotation.y = k * 0.9;
        } else obj.userData.door.visible = false;
      }
      if (L) {
        const blink = Math.floor(t / 0.36) % 2 === 0;
        const hz = within(def.hazard, t);
        const left = hz || within(def.indL, t);
        const right = hz || within(def.indR, t);
        const braking = within(def.brake, t);
        for (const m of L.indL) m.emissive.set(left && blink ? '#ff9a1a' : '#000000');
        for (const m of L.indR) m.emissive.set(right && blink ? '#ff9a1a' : '#000000');
        for (const m of L.tail) m.emissive.set(braking ? '#ff1a1a' : lightsOn ? '#6a0000' : '#250000');
        for (const m of L.head) m.emissive.set(lightsOn ? '#fff4d8' : '#000000');
        for (const m of L.reverse || []) m.emissive.set(within(def.rev, t) || within(def.revLights, t) ? '#ffffff' : '#000000');
        if (L.beacon) for (const m of L.beacon) m.emissive.set(Math.floor(t * 2.4) % 2 ? '#ff9a1a' : '#201000');
      }
    },
  };
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export { ATMOS };
