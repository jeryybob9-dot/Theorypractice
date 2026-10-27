// Hazard perception clip generator.
//
// Each clip is built from an environment preset plus one (or, for one clip per test, two) developing-hazard
// templates. A template schedules other road users relative to the camera car's timeline, then asks the
// solver to make the camera car brake as late as is safe. The scoring window runs from the moment the
// hazard starts to develop (the cue) to just after the point where a driver would have to act.
import { rng } from '../util.js';
import { Route, SpeedProfile, Track } from './road.js';
import { CAR_COLOURS } from './models.js';

const MPH = 0.44704;
const SIGN = {
  bendRight: 'assets/hc/55b76a5d40f0b67aa300000f_warning-sign-bend-to-right.webp',
  doubleBend: 'assets/hc/55b76a2d40f0b6790f000015_warning-sign-double-bend.webp',
  crossroads: 'assets/hc/55b7696640f0b6790f000011_warning-sign-crossroads.webp',
  tJunction: 'assets/hc/55b769b2ed915d07e200000b_warning-sign-t-junction-with-priority.webp',
  junctionBend: 'assets/hc/55b7698540f0b6790f000013_warning-sign-junction-on-bend-ahead.webp',
  horses: 'assets/hc/55b76fa6ed915d07fe00001b_warning-sign-accompanied-horses.webp',
  wild: 'assets/hc/55b76f70e5274a21ec00001a_warning-sign-wild-animals.webp',
  cattle: 'assets/hc/55b76f56e5274a21ec000018_warning-sign-cattle.webp',
  zebra: 'assets/hc/55b76e1040f0b6790f00001d_warning-sign-zebra-crossing.webp',
  pedestrians: 'assets/hc/55b76dfbed915d07fe000017_warning-sign-pedestrians-in-road-ahead.webp',
  sideLeft: 'assets/hc/55b7696640f0b6790f000011_warning-sign-crossroads.webp',
  sideRight: 'assets/hc/55b7696640f0b6790f000011_warning-sign-crossroads.webp',
  nsl: 'nsl',
  roadNarrows: 'assets/hc/55b75eeded915d07fe000005_warning-sign-road-narrow.webp',
  queues: 'assets/hc/55b76ffa40f0b6790f000021_warning-sign-traffic-queues.webp',
  humps: 'assets/hc/55b7701940f0b6790f000023_warning-sign-distance-humps-extend.webp',
  cycleRoute: 'assets/hc/55b76fbced915d07e200000f_warning-sign-cycle-route-ahead.webp',
  slippery: 'assets/hc/55b76bec40f0b6790f000019_warning-sign-slippery-road.webp',
};

// ---- Environment presets -----------------------------------------------------------------------

const ENVS = {
  residential: (r) => ({
    env: 'residential', limit: 30, v0: r.range(26, 29) * MPH, egoD: -1.15,
    layout: {
      road: { width: 9, spec: { centre: r.chance(0.5) ? 'dash' : 'none', edge: 'none', tone: r.pick(['#55585c', '#5b5d60', '#505357']) } },
      left: { pavement: 2.2, back: 'houses', terrace: r.range(0.3, 0.8) }, right: { pavement: 2.2, back: r.chance(0.85) ? 'houses' : 'park', terrace: r.range(0.3, 0.8) },
      lamps: { spacing: 32, sides: [-1, 1] },
    },
    parkLeft: r.range(0.35, 0.7), parkRight: r.range(0.3, 0.7), parkD: 3.55,
    peds: r.range(0.7, 1.4), oncoming: [7, 16], oncomingV: [10, 12.5], oncomingD: 1.15,
  }),
  town: (r) => ({
    env: 'town', limit: 30, v0: r.range(24, 28) * MPH, egoD: -1.9,
    layout: {
      road: { width: 10, spec: { centre: 'dash', edge: 'none' } },
      left: { pavement: 3.2, back: 'shops' }, right: { pavement: 3.2, back: 'shops' },
      lamps: { spacing: 28, sides: [-1, 1] },
    },
    parkLeft: r.range(0, 0.3), parkRight: r.range(0, 0.3), parkD: 4.05,
    peds: r.range(2.5, 4.5), oncoming: [5, 11], oncomingV: [9.5, 12], oncomingD: 1.9,
  }),
  village: (r) => ({
    env: 'village', limit: 30, v0: r.range(26, 29) * MPH, egoD: -1.6,
    layout: {
      road: { width: 7, spec: { centre: 'dash', edge: 'none' } },
      left: { pavement: 1.8, back: 'cottages' }, right: { pavement: r.chance(0.5) ? 1.6 : 0, verge: 1.2, kerb: true, back: 'cottages' },
      lamps: { spacing: 45, sides: [-1] },
    },
    parkLeft: 0, parkRight: 0, parkD: 2.6,
    peds: r.range(0.4, 0.9), oncoming: [9, 20], oncomingV: [11, 13], oncomingD: 1.7,
  }),
  rural: (r) => ({
    env: 'rural', limit: 'nsl', v0: r.range(40, 48) * MPH, egoD: -1.5,
    layout: {
      road: { width: 6.2, spec: { centre: r.chance(0.7) ? 'dash' : 'none', edge: r.chance(0.6) ? 'solid' : 'none', tone: '#5a5c5d' } },
      left: { verge: r.range(0.8, 1.8), back: 'hedge', hedgeH: r.range(1.6, 2.4), gateways: 0.03 }, right: { verge: r.range(0.8, 1.8), back: 'hedge', hedgeH: r.range(1.6, 2.4), gateways: 0.03 },
    },
    parkLeft: 0, parkRight: 0,
    peds: 0, oncoming: [10, 26], oncomingV: [17, 23], oncomingD: 1.55,
  }),
  dual: (r) => ({
    env: 'dual', limit: 70, v0: r.range(58, 66) * MPH, egoD: -5.45, lanes: [-5.45, -1.85],
    layout: {
      carriageways: [
        { d0: -7.4, d1: -0.15, spec: { edgeLeft: 'solid', edgeRight: 'solid', laneLines: [0] } },
        { d0: 0.15, d1: 7.4, spec: { edgeLeft: 'solid', edgeRight: 'solid', laneLines: [0] } },
      ],
      reservation: { d0: -0.15, d1: 0.15 },
      left: { verge: 3, back: 'embankment' }, right: { verge: 3, back: 'embankment' },
    },
    parkLeft: 0, parkRight: 0, peds: 0, oncoming: [3, 9], oncomingV: [27, 31], oncomingD: 3.6, oncomingLanes: [1.85, 5.45],
  }),
  motorway: (r) => ({
    env: 'motorway', limit: 70, v0: r.range(64, 69) * MPH, egoD: -9.35, lanes: [-9.35, -5.7, -2.05],
    layout: {
      carriageways: [
        { d0: -14.4, d1: -0.4, spec: { edgeLeft: 'solid', edgeRight: 'solid', laneLines: [-7 + 3.3 + 3.65, -7 + 3.3 + 7.3].map((x) => x), period: 18 } },
        { d0: 0.4, d1: 14.4, spec: { edgeLeft: 'solid', edgeRight: 'solid', laneLines: [-7 + 3.65 + 0.05, -7 + 7.3 + 0.05], period: 18 } },
      ],
      reservation: { d0: -0.4, d1: 0.4 },
      left: { verge: 4, back: 'embankment' }, right: { verge: 4, back: 'embankment' },
    },
    parkLeft: 0, parkRight: 0, peds: 0, oncoming: [2, 6], oncomingV: [28, 32], oncomingD: 6, oncomingLanes: [2.05, 5.7, 9.35],
  }),
};

function fixMotorwaySpec(env) {
  // carriageway texture d is measured from its own centre; lanes are 3.65 m with a 3.3 m hard shoulder on the left
  if (env.env === 'motorway') {
    env.layout.carriageways[0].spec.laneLines = [-7 + 3.3, -7 + 3.3 + 3.65, -7 + 3.3 + 7.3].slice(0, 3).map((x) => x);
    env.layout.carriageways[0].spec.laneLines = [-3.7 + 0.0, -0.05, 3.6];
    env.layout.carriageways[0].spec.edgeLeft = 'none';
    env.layout.carriageways[0].spec.hardShoulderAt = -3.7;
    env.layout.carriageways[1].spec.laneLines = [-3.6, 0.05, 3.7];
    env.layout.carriageways[1].spec.edgeRight = 'none';
    // solid edge line between the hard shoulder and lane 1 (drawn as a laneLine is dashed) — use explicit edge
    env.layout.carriageways[0].spec.edgeLeft = 'solid';
  }
}

// ---- Build context ------------------------------------------------------------------------------

class Ctx {
  constructor(seed, envName, opts = {}) {
    this.r = rng(seed);
    this.seed = seed;
    const r = this.r;
    this.E = ENVS[envName](r);
    fixMotorwaySpec(this.E);
    const w = opts.weather, tm = opts.time;
    if (w === 'fog') this.E.v0 *= ['dual', 'motorway'].includes(envName) ? 0.6 : 0.68;
    else if (tm === 'night') this.E.v0 *= ['residential', 'town'].includes(envName) ? 0.95 : 0.85;
    else if (w === 'rain') this.E.v0 *= 0.92;
    this.v0 = this.E.v0;
    this.keys = [[0, this.v0]];
    this.lastT = 0;
    this.actors = [];
    this.hazards = [];
    this.junctions = [];
    this.crossings = [];
    this.busStops = [];
    this.signs = [];
    this.parked = [];
    this.markings = [];
    this.noScenery = [];
    this.noPark = [];
    this.noOncoming = [];
    this.noPeds = [];
    this.lat = [[0, this.E.egoD]];
    this.after = [];
    this.time = opts.time || 'day';
    this.weather = opts.weather || 'clear';
    this.segments = null;
    this.straights = [];
    this.uid = 1;
  }

  // Route: straights with gentle bends; returns list of straight intervals
  makeRoute(len, { bends = true, sharp = false } = {}) {
    const r = this.r;
    const segs = [];
    let s = 0;
    const urban = ['residential', 'town', 'village'].includes(this.E.env);
    const fast = ['dual', 'motorway'].includes(this.E.env);
    while (s < len + 400) {
      const sl = r.range(urban ? 90 : 120, urban ? 220 : 320);
      segs.push({ len: sl, k: 0 });
      this.straights.push([s, s + sl]);
      s += sl;
      if (!bends) continue;
      const R = fast ? r.range(900, 2000) : urban ? r.range(160, 420) : sharp ? r.range(70, 140) : r.range(110, 300);
      const bl = r.range(fast ? 150 : 40, fast ? 350 : urban ? 90 : 120);
      const k = (r.chance(0.5) ? 1 : -1) / R;
      segs.push({ len: bl, k });
      s += bl;
    }
    this.segments = segs;
    this.routeLen = s;
    // gentle hills on rural roads
    if (this.E.env === 'rural' || this.E.env === 'village') {
      const elev = [];
      let h = 0;
      for (let x = 0; x < s; x += r.range(150, 300)) { elev.push([x, h]); h += r.range(-3.5, 3.5); }
      this.elev = elev;
    }
    this.route = new Route(segs, this.elev || null, 1);
    return segs;
  }

  // nearest straight interval that contains [s-a, s+b]
  straightNear(s, a = 30, b = 30) {
    let best = null, bestD = 1e9;
    for (const [s0, s1] of this.straights) {
      const lo = s0 + a, hi = s1 - b;
      if (hi < lo) continue;
      const c = Math.max(lo, Math.min(hi, s));
      if (Math.abs(c - s) < bestD) { bestD = Math.abs(c - s); best = c; }
    }
    return best ?? s;
  }

  profile(keys = this.keys) {
    return new SpeedProfile(keys, 0, 140);
  }

  egoS(t) {
    if (!this._prof || this._profKeys !== this.keys) { this._prof = this.profile(); this._profKeys = this.keys; }
    return this._prof.s(t);
  }

  egoT(s) {
    this.egoS(0);
    return this._prof.tAt(s);
  }

  cruiseV() { return this.keys[this.keys.length - 1][1]; }

  // Target length of a scoring window (seconds from the first sign of the hazard to having to act).
  win() { return this.r.range(3.6, 5.0); }

  // Where a conflict point should be so that, braking comfortably, the camera car has to start
  // responding about W seconds after the cue.
  lead(tCue, W, margin = 7, decel = 3.2) {
    const v = this.cruiseV();
    return this.egoS(tCue) + v * W + (v * v) / (2 * decel) + margin;
  }

  // Smallest s >= sMin that lies on a straight with room a before and b after.
  straightAfter(sMin, a = 30, b = 30) {
    let best = null;
    for (const [s0, s1] of this.straights) {
      const lo = s0 + a, hi = s1 - b;
      if (hi < lo || hi < sMin) continue;
      const c = Math.max(lo, sMin);
      if (best == null || c < best) best = c;
    }
    return best ?? sMin;
  }

  // Place a hazard's conflict point on a straight and return the matching cue time, so that the
  // camera car is exactly `ahead` metres away when the hazard starts to develop.
  place(tCue, W, margin = 7, decel = 3.2, a = 10, b = 10, extra = 0) {
    const v = this.cruiseV();
    const ahead = v * W + (v * v) / (2 * decel) + margin;
    const minT = this.lastT + 3;
    let s = this.straightNear(this.egoS(tCue) + ahead + extra, a, b) - extra;
    let t = this.egoT(s - ahead);
    if (t == null || t < minT) {
      s = this.straightAfter(this.egoS(Math.max(minT, tCue)) + ahead + extra, a, b) - extra;
      t = this.egoT(s - ahead) ?? tCue;
    }
    return { s, t, ahead };
  }

  // Height of whatever lines the road beyond sightLimit (you can see over a hedge, not a house).
  sightHeight(side) {
    const cfg = side < 0 ? this.E.layout.left : this.E.layout.right;
    if (cfg.back === 'hedge') return cfg.hedgeH || 1.8;
    if (cfg.back === 'park') return 1.0;
    if (cfg.back === 'embankment') return 0;
    return 9;
  }

  // How far either side of the road you can see past (hedges, buildings), per side.
  sightLimit(side) {
    const E = this.E, L = E.layout;
    const half = L.road ? L.road.width / 2 : Math.max(...L.carriageways.map((c) => Math.abs(side < 0 ? c.d0 : c.d1)));
    const cfg = side < 0 ? L.left : L.right;
    const base = half + (cfg.pavement || 0) + (cfg.verge || 0);
    if (cfg.back === 'hedge') return base + 0.5;
    if (cfg.back === 'shops') return base + 0.3;
    if (cfg.back === 'houses') return base + 3.2;
    if (cfg.back === 'cottages') return base + 1.6;
    if (cfg.back === 'park') return base + 6;
    return base + 25;
  }

  // Can the driver at (sA, dA) see a road user at (sB, dB)? Checks hedges/buildings on bends and hill crests.
  canSee(sA, dA, sB, dB, hB = 1.0) {
    const R = this.route;
    const A = R.pos(sA, dA, 1.2), B = R.pos(sB, dB, hB);
    const dist = Math.hypot(B.x - A.x, B.z - A.z);
    if (dist > this.sightMax()) return false;
    const n = Math.max(2, Math.ceil(dist / 3));
    for (let i = 1; i < n; i++) {
      const u = i / n;
      if (u > 0.92) break; // the last few metres are next to the road user itself
      const x = A.x + (B.x - A.x) * u, z = A.z + (B.z - A.z) * u, y = A.y + (B.y - A.y) * u;
      const pr = R.project(x, z, sA + (sB - sA) * u);
      if (y < R.height(pr.s) + 0.05) return false; // hidden by a crest
      const side = pr.d < 0 ? -1 : 1;
      if (Math.abs(pr.d) > this.sightLimit(side) && y - R.height(pr.s) < this.sightHeight(side)) {
        // looking into a side road or gateway is fine
        const open = this.junctions.some((j) => j.side === side && Math.abs(pr.s - j.s) < j.width / 2 + 2);
        if (!open) return false;
      }
    }
    return true;
  }

  sightMax() {
    if (this.weather === 'fog') return 70;
    if (this.time === 'night') return 140;
    if (this.weather === 'rain') return 170;
    return 260;
  }

  // The bend (curved segment) whose start is nearest after s.
  bendNear(s) {
    let acc = 0, best = null;
    for (const seg of this.segments) {
      if (seg.k && acc >= s && (!best || acc - s < best.start - s)) best = { start: acc, len: seg.len, end: acc + seg.len, k: seg.k };
      acc += seg.len;
    }
    return best;
  }

  actor(def) {
    def.id = this.uid++;
    def.seed = def.seed || this.r.int(1, 1e9);
    this.actors.push(def);
    return def;
  }

  // Make the camera car respond to a hazard as late as is safe.
  // ev: { cueT, check: [t0, t1], limit(t) -> max s allowed, vMin, decel, accel, resumeT, label, desc, reaction }
  event(ev) {
    const subject = ev.subject || this.actors.find((a) => a.hazardActor && a.id > (this._lastSubjectId || 0));
    if (subject) this._lastSubjectId = Math.max(...this.actors.map((a) => a.id));
    const prev = this.keys.slice();
    const vC = this.cruiseV();
    const vMin = ev.vMin ?? 0;
    const accel = ev.accel ?? 1.6;
    const tLo = Math.max(this.lastT + 0.5, ev.cueT - 2);
    const tHi = ev.check[1];
    const build = (tb, decel, tr) => {
      const keys = prev.filter((k) => k[0] < tb);
      keys.push([tb, vC]);
      const tStop = tb + Math.max(0.2, (vC - vMin) / decel);
      keys.push([tStop, vMin]);
      const resume = Math.max(tStop + 0.3, tr);
      keys.push([resume, vMin]);
      keys.push([resume + Math.max(0.5, (vC - vMin) / accel), ev.vAfter ?? vC]);
      return keys;
    };
    const ok = (keys) => {
      const p = this.profile(keys);
      for (let t = ev.check[0]; t <= ev.check[1] + 6; t += 0.1) {
        const lim = ev.limit(t);
        if (lim != null && p.s(t) > lim) return false;
      }
      return true;
    };
    let decel = ev.decel ?? 3.2;
    let resumeT = ev.resumeT ?? ev.check[1];
    let lo = tLo, hi = tHi;
    let tries = 0;
    while (!ok(build(lo, decel, resumeT)) && tries < 8) {
      if (decel < 6.5) decel += 0.8; else resumeT += 0.6;
      tries++;
    }
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (ok(build(mid, decel, resumeT))) lo = mid; else hi = mid;
    }
    let tb = lo;
    if (ev.brakeAt != null && ev.brakeAt < tb) tb = ev.brakeAt;
    // resume as early as is still safe
    let keys = build(tb, decel, resumeT);
    for (let k = 0; k < 12 && ok(build(tb, decel, resumeT - 0.5)) && resumeT - 0.5 > tb + 1; k++) { resumeT -= 0.5; keys = build(tb, decel, resumeT); }
    this.keys = keys;
    this.lastT = keys[keys.length - 1][0];
    const reaction = ev.reaction ?? 0.6;
    let end = tb + reaction;
    let start = ev.cueT;
    if (end - start < 2.6) end = start + 2.6;
    if (end - start > 6.5) start = end - 6.5;
    const hz = { start, end, label: ev.label, desc: ev.desc, brake: tb, cue: ev.cueT, subject };
    this.hazards.push(hz);
    return hz;
  }

  hazardSign(s, img, side = -1, opts = {}) {
    this.signs.push({ s, side, img, size: 0.9, h: 1.8, ...opts });
  }

  park(s, side, opts = {}) {
    this.parked.push({ s, side, d: side * (opts.dAbs ?? this.E.parkD), color: opts.color || this.r.pick(CAR_COLOURS), style: opts.style || this.r.pick(['hatch', 'hatch', 'saloon', 'estate', 'suv']), type: opts.type, flip: opts.flip ?? (side > 0 && this.r.chance(0.7)) });
  }
}

// ---- Distractor traffic and people -----------------------------------------------------------------

function finish(ctx, duration) {
  const r = ctx.r;
  const E = ctx.E;
  const prof = ctx.profile();
  const egoS = (t) => prof.s(t);
  const sEnd = egoS(duration) + 120;
  // parked cars along kerbs
  for (const side of [-1, 1]) {
    const dens = side < 0 ? E.parkLeft : E.parkRight;
    if (!dens) continue;
    for (let s = -10; s < sEnd + 80; s += r.range(5.2, 6.5)) {
      if (!r.chance(dens)) { s += r.range(0, 8); continue; }
      if (blockedPark(ctx, side, s)) continue;
      ctx.park(s, side);
    }
  }
  // oncoming traffic: each lane has one speed so vehicles never catch each other up
  if (E.oncoming) {
    const lanes = E.oncomingLanes || [E.oncomingD];
    const laneV = lanes.map(() => r.range(E.oncomingV[0], E.oncomingV[1]));
    const lastTp = lanes.map(() => -99);
    let t = r.range(-4, E.oncoming[1]);
    while (t < duration + 6) {
      const blocked = ctx.noOncoming.some(([a, b]) => t > a - 1.5 && t < b + 1.5);
      const li = r.int(0, lanes.length - 1);
      if (!blocked && t - lastTp[li] > 2.2) {
        lastTp[li] = t;
        const v = laneV[li] + r.range(-0.2, 0.2);
        const d = lanes[li];
        const sp = t < 0 ? ctx.v0 * t : egoS(t);
        const kind = r() < 0.08 && E.env !== 'motorway' ? 'van' : r() < 0.04 && E.env !== 'motorway' && E.env !== 'dual' ? 'bus' : (E.env === 'motorway' || E.env === 'dual') && r() < 0.25 ? 'lorry' : 'car';
        ctx.actor({ type: kind, opts: { color: r.pick(CAR_COLOURS), style: r.pick(['hatch', 'saloon', 'estate', 'suv']) }, keys: [[-5, sp + v * (t + 5), d], [160, sp - v * (160 - t), d]], distractor: true });
      }
      t += r.range(E.oncoming[0], E.oncoming[1]);
    }
  }
  // same-direction traffic in the other lanes of multi-lane roads (one speed per lane)
  if (E.lanes && E.lanes.length > 1 && !ctx.noLaneTraffic) {
    for (const lane of E.lanes.filter((x) => x !== E.egoD)) {
      const v = ctx.v0 + r.range(2, 5) * (lane > E.egoD ? 1 : -0.5);
      for (let k = 0; k < Math.round(duration / 9); k++) {
        const t = r.range(0, duration);
        if (ctx.noOncoming.some(([a, b]) => t > a - 3 && t < b + 3)) continue;
        const sp = egoS(t) + r.range(-6, 6);
        ctx.actor({ type: r() < 0.2 ? 'lorry' : r() < 0.15 ? 'van' : 'car', opts: { color: r.pick(CAR_COLOURS) }, keys: [[-5, sp - v * (t + 5), lane], [160, sp + v * (160 - t), lane]], distractor: true });
      }
    }
  }
  // pedestrians on the pavements
  if (E.peds) {
    const count = Math.round((sEnd / 100) * E.peds * 2);
    for (let k = 0; k < count; k++) {
      const side = r.chance(0.5) ? -1 : 1;
      const cfg = side < 0 ? E.layout.left : E.layout.right;
      if (!cfg.pavement) continue;
      const edge = side * (E.layout.road.width / 2);
      const d = edge + side * r.range(0.6, cfg.pavement - 0.5);
      const s0 = r.range(10, sEnd);
      if (ctx.noPeds.some(([a, b, sd]) => (sd == null || sd === side) && s0 > a - 15 && s0 < b + 15)) continue;
      const dir = r.chance(0.5) ? 1 : -1;
      const still = r.chance(0.15);
      const elderly = r.chance(0.12);
      const v = r.range(1.1, 1.55) * (elderly ? 0.6 : 1);
      // walk until the next side road on this side of the road, then wait at the kerb
      let s1 = s0 + dir * v * (duration + 5);
      for (const j of ctx.junctions) {
        if (j.side !== side || j.kind === 'gate') continue;
        const edgeNear = j.s - dir * (j.width / 2 + 1.2);
        if ((edgeNear - s0) * dir > 0 && (s1 - edgeNear) * dir > 0) s1 = edgeNear;
      }
      if (ctx.junctions.some((j) => j.side === side && j.kind !== 'gate' && Math.abs(s0 - j.s) < j.width / 2 + 1.5)) continue;
      const tWalk = Math.abs(s1 - s0) / v;
      const keys = still ? [[0, s0, d], [duration, s0, d]] : [[0, s0, d], [tWalk, s1, d], [Math.max(tWalk + 1, duration + 5), s1, d]];
      ctx.actor({ type: r.chance(0.08) ? 'child' : 'person', opts: { bag: r.chance(0.3), elderly }, keys, yaw0: still ? (side < 0 ? Math.PI / 2 : -Math.PI / 2) : null, distractor: true });
    }
  }
  // speed limit signs near the start, like repeaters
  if (E.limit === 'nsl') ctx.signs.push({ s: 25, side: -1, speed: 'nsl', size: 0.8, h: 1.9 });
  else if (E.limit && E.env !== 'motorway' && E.env !== 'dual') ctx.signs.push({ s: 22, side: -1, speed: E.limit, size: 0.6, h: 2.1 });
  // bend warning signs on rural roads
  if (E.env === 'rural') {
    let acc = 0;
    for (const seg of ctx.segments) {
      if (seg.k && Math.abs(seg.k) > 1 / 200 && acc > 80) ctx.signs.push({ s: acc - 70, side: -1, img: SIGN.bendRight, size: 0.9, h: 1.6, aspect: 1.15, mirror: seg.k < 0 });
      acc += seg.len;
    }
  }
  for (const f of ctx.after) f(prof);
  const egoLat = new Track(ctx.lat.length ? ctx.lat : [[0, E.egoD]]);
  for (const hz of ctx.hazards) {
    if (!hz.subject) continue;
    const tr = new Track(hz.subject.keys);
    const a = [], l = [];
    const hgt = { ball: 0.25, dog: 0.5, child: 1.0, person: 1.5, cyclist: 1.5, deer: 1.2, horse: 2.3, car: 1.3, van: 2.0, bus: 3.0, lorry: 3.5, tractor: 2.6, motorbike: 1.5 }[hz.subject.type] || 1.2;
    let seen = null;
    for (let t = hz.start; t <= hz.end + 4; t += 0.1) {
      tr.at(t, a); egoLat.at(t, l);
      if (ctx.canSee(egoS(t), l[0] + 0.38, a[0], a[1], hgt)) { seen = t; break; }
    }
    hz.visibleAt = seen;
    if (seen != null && seen > hz.start + 0.05) {
      hz.start = seen;
      if (hz.end - hz.start < 3.0) hz.end = hz.start + 3.0;
    }
  }
  for (const a of ctx.actors) {
    if (!a.leaveAhead) continue;
    const tr = new Track(a.keys);
    const tmp = [];
    // only once it has driven off ahead of us (after the last moment it was stationary or slow)
    let from = a.keys[0][0];
    for (let i = 1; i < a.keys.length; i++) if (a.keys[i][1] === a.keys[i - 1][1] && a.keys[i][2] === a.keys[i - 1][2]) from = a.keys[i][0];
    from = Math.max(from, a.leaveAfter ?? from);
    for (let t = from; t < 160; t += 0.25) {
      tr.at(t, tmp);
      if (tmp[0] - egoS(Math.min(t, duration + 4)) > 150) { a.visible = [[-10, t]]; break; }
    }
  }
  // same-lane leftovers can't share a lane with later developing hazards
  // (templates with a lead vehicle are only ever used as the first hazard of a clip)
  const lat = ctx.lat;
  return {
    seed: ctx.seed,
    env: E.env,
    time: ctx.time,
    weather: ctx.weather,
    duration,
    route: { segments: ctx.segments, elev: ctx.elev || null },
    layout: E.layout,
    junctions: ctx.junctions,
    crossings: ctx.crossings,
    busStops: ctx.busStops,
    signs: ctx.signs,
    parked: ctx.parked,
    markings: ctx.markings,
    noScenery: ctx.noScenery,
    ego: { speeds: ctx.keys, lat, s0: 0 },
    actors: ctx.actors,
    hazards: ctx.hazards.map((h) => ({ start: +h.start.toFixed(2), end: +h.end.toFixed(2), label: h.label, desc: h.desc, brakeLead: +(h.brake - h.cue).toFixed(2), late: h.visibleAt == null ? null : +(h.visibleAt - h.cue).toFixed(2) })),
  };
}

function blockedPark(ctx, side, s) {
  for (const j of ctx.junctions) if (j.side === side && Math.abs(s - j.s) < j.width / 2 + 9) return true;
  for (const j of ctx.junctions) if (j.side !== side && Math.abs(s - j.s) < j.width / 2 + 3) return true;
  for (const c of ctx.crossings) if (Math.abs(s - c.s) < 22) return true;
  for (const b of ctx.busStops) if (b.side === side && s > b.s - 16 && s < b.s + 16) return true;
  for (const [a, b, sd] of ctx.noPark) if ((sd == null || sd === side) && s > a && s < b) return true;
  return false;
}

// ---- Templates ----------------------------------------------------------------------------------------
// Each: (ctx, tCue) -> void. Positions use road coordinates (s along, d across; d<0 = our side).

const T = {};

// A pedestrian walks along the pavement, turns and steps out between parked cars.
T.pedestrianStepsOut = {
  envs: ['residential', 'town'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const W = ctx.win();
    const side = E.env === 'town' ? r.pick([-1, 1]) : -1;
    const P = ctx.place(tCue, W, 0, 3.2, 16, 16);
    const sC = P.s + 6;
    tCue = P.t;
    const half = E.layout.road.width / 2;
    const edge = side * half;
    const pave = side * (half + 1.0);
    ctx.noPark.push([sC - 14, sC + 14, side]);
    ctx.noPark.push([sC - 5, sC + 6, -side]);
    ctx.park(sC - 3.4, side, { style: r.pick(['suv', 'estate']), dAbs: E.parkD || half - 1.0 });
    ctx.park(sC + 3.4, side, { type: r.chance(0.5) ? 'van' : undefined, style: 'suv', color: '#f2f2f0', dAbs: E.parkD || half - 1.0 });
    ctx.noPeds.push([sC - 12, sC + 12]);
    const child = r.chance(0.35);
    const tStep = tCue + W * 0.45;
    const parkLine = side * ((E.parkD || half - 1.0) - 1.05);
    const keys = [
      [0, sC - 1.35 * (tCue + 0.5), pave],
      [tCue - 0.3, sC - 0.8, pave],
      [tCue + 0.5, sC - 0.25, pave - side * 0.35],
      [tStep, sC, edge + side * 0.05],
      [tStep + 1.3, sC, parkLine],
      [tStep + 2.4, sC + 0.1, E.egoD + side * 0.6],
      [tStep + 3.2, sC + 0.1, E.egoD - side * 0.3],
      [tStep + 6, sC + 0.4, -side * (half - 0.4)],
      [tStep + 7.4, sC + 0.6, -side * (half + 1.0)],
      [tStep + 30, sC + 30, -side * (half + 1.0)],
    ];
    ctx.actor({ type: child ? 'child' : 'person', opts: { bag: !child && r.chance(0.4) }, keys, hazardActor: true });
    ctx.noOncoming.push([tStep, tStep + 7.5]);
    ctx.event({
      cueT: tCue, check: [tCue, tStep + 6.5], vMin: 0,
      limit: (t) => (t < tStep + 6.5 ? sC - 6 : null), resumeT: tStep + 5.8,
      label: child ? 'A child steps out between parked cars' : 'A pedestrian steps out between parked cars',
      desc: 'Someone on the pavement turned towards the road and walked out between the parked vehicles. The hazard starts to develop when they turn towards the kerb.',
    });
  },
};

// A ball rolls into the road, followed by a child.
T.ballChild = {
  envs: ['residential'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const W = r.range(3.4, 4.4);
    const side = r.pick([-1, 1]);
    const P = ctx.place(tCue, W, 0, 3.2, 16, 16);
    const sC = P.s + 6;
    tCue = P.t;
    const half = E.layout.road.width / 2;
    ctx.noPark.push([sC - 8, sC + 8, side]);
    ctx.noPark.push([sC - 6, sC + 8, -side]);
    ctx.park(sC - 4.6, side, { dAbs: E.parkD });
    ctx.park(sC + 4.4, side, { dAbs: E.parkD });
    ctx.noPeds.push([sC - 14, sC + 14]);
    ctx.actor({ type: 'ball', keys: [[0, sC, side * (half + 1.5)], [tCue, sC, side * (half + 1.5)], [tCue + 0.7, sC + 0.3, side * half], [tCue + 2.8, sC + 1.2, -side * (half - 0.5)], [tCue + 4.5, sC + 1.6, -side * (half + 0.6)]], hazardActor: true });
    const tc = tCue + W * 0.45;
    ctx.actor({ type: 'child', keys: [[0, sC - 0.5, side * (half + 1.7)], [tc - 0.6, sC - 0.5, side * (half + 1.7)], [tc, sC - 0.3, side * (half + 0.2)], [tc + 1.0, sC, side * (half - 1.6)], [tc + 1.9, sC + 0.2, E.egoD], [tc + 4.6, sC + 0.8, -side * (half - 0.5)], [tc + 6.2, sC + 1, -side * (half + 1)]], hazardActor: true });
    ctx.noOncoming.push([tCue, tc + 6.5]);
    ctx.event({
      cueT: tCue, check: [tCue, tc + 5.5], vMin: 0, limit: (t) => (t < tc + 5.5 ? sC - 6 : null), resumeT: tc + 5,
      label: 'A ball rolls into the road and a child runs after it',
      desc: 'A ball in the road is a warning that a child may follow it. The hazard starts to develop as the ball appears.',
    });
  },
};

// A car comes out of a side road without stopping.
T.emergingCar = {
  envs: ['residential', 'village', 'rural', 'town'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const W = ctx.win();
    const side = r.pick([-1, 1]);
    const half = E.layout.road.width / 2;
    const P = ctx.place(tCue, W, 0, 3.2, 50, 30);
    const sJ = P.s + 6;
    tCue = P.t;
    const jw = E.env === 'rural' ? 5.5 : 6.5;
    ctx.junctions.push({ s: sJ, side, width: jw, len: 60, giveWay: true });
    ctx.noPark.push([sJ - 12, sJ + 12, side]);
    if (E.env === 'rural' || E.env === 'village') ctx.signs.push({ s: sJ - 110, side: -1, img: side < 0 ? SIGN.sideLeft : SIGN.sideRight, size: 0.9, h: 1.6, aspect: 1.15 });
    const laneIn = side < 0 ? jw / 4 : -jw / 4; // keep left in the side road
    const sIn = sJ + laneIn;
    const tLine = tCue + W * 0.55;
    const vIn = r.range(6.5, 8.5);
    const keys = [
      [tCue - 12, sIn, side * (half + 3 + vIn * 12)],
      [tCue - 0.2, sIn, side * (half + 3 + vIn * (tLine - tCue) * 0.85)],
      [tLine, sIn, side * (half - 0.2)],
    ];
    const laneOut = E.egoD;
    // after pulling out it moves off slowly, then speeds up and drives away
    const vEnd = ctx.v0 + 2;
    const pull = side < 0 ? [[tLine + 0.9, sJ + 2.4, -(half - 2.2)], [tLine + 1.9, sJ + 7, laneOut]] : [[tLine + 1.0, sJ - 0.5, 0.5], [tLine + 2.1, sJ + 4.5, laneOut]];
    keys.push(...pull);
    const [tA, sA] = keys[keys.length - 1];
    keys.push([tA + 3, sA + 4.5 * 3, laneOut], [tA + 10, sA + 13.5 + ((4.5 + vEnd) / 2) * 7, laneOut], [tA + 80, sA + 13.5 + ((4.5 + vEnd) / 2) * 7 + vEnd * 70, laneOut]);
    ctx.actor({ type: r.chance(0.15) ? 'van' : 'car', opts: { style: r.pick(['hatch', 'saloon', 'estate', 'suv']) }, keys, indR: side > 0 ? [[tCue - 6, tLine + 1.5]] : [], hazardActor: true, leaveAhead: true });
    ctx.noOncoming.push([tLine - 2.5, tLine + 4]);
    const carS = new Track(keys);
    const tmp = [];
    ctx.event({
      cueT: tCue, check: [tCue, tLine + 14], vMin: r.range(4, 6), vAfter: ctx.v0,
      limit: (t) => {
        if (t < tLine - 0.2) return sJ - 6;
        carS.at(t, tmp);
        return tmp[0] - 12;
      },
      resumeT: tLine + 4,
      label: 'A car pulls out of a side road',
      desc: "The car approaching the junction wasn't slowing down for the give way lines. The hazard develops when it's clear it isn't going to stop.",
    });
  },
};

// The DVSA's own example: a parked car signals and moves off.
T.parkedCarPullsOut = {
  envs: ['residential', 'town'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const W = ctx.win();
    const half = E.layout.road.width / 2;
    const P = ctx.place(tCue, W, 0, 3.2, 16, 30);
    const sP = P.s + 8;
    tCue = P.t;
    const dPark = -(E.parkD || half - 0.95);
    ctx.noPark.push([sP - 9, sP + 9, -1]);
    ctx.park(sP - 7, -1, { dAbs: -dPark });
    const tMove = tCue + W * 0.35;
    const vEnd = ctx.v0 + 2;
    const keys = [[0, sP, dPark], [tMove, sP, dPark], [tMove + 1.7, sP + 3, dPark + 0.9], [tMove + 3.4, sP + 9, E.egoD], [tMove + 7, sP + 9 + 3.6 * 5.5, E.egoD], [tMove + 14, sP + 28.8 + 7 * ((5.5 + vEnd) / 2), E.egoD], [tMove + 80, sP + 28.8 + 7 * ((5.5 + vEnd) / 2) + 66 * vEnd, E.egoD]];
    ctx.actor({ type: 'car', opts: { style: r.pick(['hatch', 'saloon', 'suv']) }, keys, indR: [[tCue, tMove + 3.6]], yaw0: 0, hazardActor: true, leaveAhead: true });
    const tr = new Track(keys);
    const tmp = [];
    ctx.noOncoming.push([tMove, tMove + 4.5]);
    ctx.event({
      cueT: tCue, check: [tCue, tMove + 16], vMin: r.range(3, 5), vAfter: ctx.v0 * 0.95,
      limit: (t) => (t < tMove ? sP - 8 : (tr.at(t, tmp), tmp[0] - 11)),
      resumeT: tMove + 3,
      label: 'A parked car pulls out',
      desc: "The parked car's right indicator came on and it started to move away from the kerb. This is the DVSA's own example of a developing hazard.",
    });
  },
};

// A bus at a stop signals and pulls out.
T.busPullsOut = {
  envs: ['town', 'residential'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const W = ctx.win();
    const half = E.layout.road.width / 2;
    const P = ctx.place(tCue, W, 0, 3.2, 30, 30);
    const sB = P.s + 9;
    tCue = P.t;
    ctx.busStops.push({ s: sB, side: -1 });
    ctx.markings.push({ box: true, s: sB, d: -(half - 1.4), len: 26, wid: 2.7 });
    ctx.noPark.push([sB - 26, sB + 20, -1]);
    const dBus = -(half - 1.45);
    const tMove = tCue + W * 0.4;
    const vB = ctx.v0 + 1;
    const keys = [[0, sB + 2, dBus], [tMove, sB + 2, dBus], [tMove + 2.6, sB + 7, dBus + 0.9], [tMove + 5.2, sB + 18, E.egoD], [tMove + 9, sB + 40, E.egoD], [tMove + 16, sB + 40 + 7 * ((7 + vB) / 2), E.egoD], [tMove + 80, sB + 40 + 7 * ((7 + vB) / 2) + 64 * vB, E.egoD]];
    ctx.actor({ type: 'bus', opts: { color: r.pick(['#c8102e', '#1d4f91', '#2c6e49', '#5a2a82']), decks: r.chance(0.5) ? 2 : 1 }, keys, indR: [[tCue, tMove + 4]], yaw0: 0, hazardActor: true, leaveAhead: true });
    for (let k = 0; k < r.int(1, 3); k++) {
      const d = -(half + 1.0 + r.range(0, 1));
      ctx.actor({ type: 'person', opts: { bag: r.chance(0.5) }, keys: [[0, sB - 3 - k, d], [tCue - 3, sB - 3 - k, d], [tCue + 30, sB - 3 - k + (r.chance(0.5) ? 1 : -1) * 38, d]] });
    }
    const tr = new Track(keys);
    const tmp = [];
    ctx.noOncoming.push([tMove + 1, tMove + 5]);
    ctx.event({
      cueT: tCue, check: [tCue, tMove + 18], vMin: r.range(2.5, 4.5), vAfter: ctx.v0 * 0.85,
      limit: (t) => (t < tMove ? sB - 9 : (tr.at(t, tmp), tmp[0] - 16)),
      resumeT: tMove + 4,
      label: 'A bus pulls away from a bus stop',
      desc: 'The bus signalled right to pull out from the stop. Give way to buses signalling to move off from stops, where it is safe to do so (rule 223).',
    });
  },
};

// The vehicle in front slows down and turns right into a side road, stopping for oncoming traffic.
T.carAheadTurns = {
  envs: ['residential', 'village', 'rural', 'town'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const half = E.layout.road.width / 2;
    const v = ctx.cruiseV();
    const gap = v * 2.4 + 8;
    const Tb = (v / r.range(1.7, 2.1));   // the car in front brakes gently, at about 2 m/s²
    let sStop = ctx.straightNear(ctx.egoS(tCue) + gap + (v * Tb) / 2, 40 + gap, 25);
    tCue = ctx.egoT(sStop - (v * Tb) / 2 - gap) ?? tCue;
    if (tCue < ctx.lastT + 3) {
      sStop = ctx.straightAfter(ctx.egoS(ctx.lastT + 3) + gap + (v * Tb) / 2, 40 + gap, 25);
      tCue = ctx.egoT(sStop - (v * Tb) / 2 - gap) ?? tCue;
    }
    const sJ = sStop + 3;
    ctx.junctions.push({ s: sJ, side: 1, width: 6.5, len: 60 });
    ctx.noPark.push([sJ - 16, sJ + 12, 1]);
    const sCue = sStop - (v * Tb) / 2;
    const wait = r.range(3, 5);
    const tStop = tCue + Tb;
    const keys = [
      [0, sCue - v * tCue, E.egoD],
      [tCue, sCue, E.egoD],
      [tCue + Tb * 0.5, sStop - (v * Tb) / 8, E.egoD + 0.2],
      [tStop, sStop, E.egoD + 0.35],
      [tStop + wait, sStop, E.egoD + 0.35],
      [tStop + wait + 1.4, sJ + 1.0, 0.4],
      [tStop + wait + 2.8, sJ + 3.25, half + 4],
      [tStop + wait + 12, sJ + 3.25, half + 60],
    ];
    ctx.actor({ type: r.chance(0.2) ? 'van' : 'car', opts: { style: r.pick(['hatch', 'saloon', 'estate']) }, keys, brake: [[tCue, tStop + wait]], indR: [[tCue - 0.2, tStop + wait + 2.2]], hazardActor: true });
    ctx.after.push(() => {
      for (let k = 0; k < 2; k++) {
        const tp = tStop + 0.6 + k * (wait / 2.2);
        const vo = E.oncomingV[1];
        ctx.actor({ type: 'car', keys: [[-5, sStop + vo * (tp + 5), E.oncomingD], [160, sStop - vo * (160 - tp), E.oncomingD]] });
      }
    });
    ctx.noOncoming.push([tCue - 2, tStop + wait + 4]);
    const tr = new Track(keys);
    const tmp = [];
    ctx.event({
      cueT: tCue, check: [tCue, tStop + wait + 3], vMin: 0, vAfter: ctx.v0,
      limit: (t) => (tr.at(t, tmp), t < tStop + wait + 1.5 ? tmp[0] - 9 : null),
      resumeT: tStop + wait + 1.3,
      label: 'The vehicle in front slows down to turn right',
      desc: 'Its brake lights and right indicator came on, and it stopped in the road to wait for oncoming traffic before turning.',
    });
  },
};

// A cyclist ahead looks over their shoulder and moves out to pass a parked vehicle.
T.cyclistMovesOut = {
  envs: ['residential', 'town'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const W = ctx.win();
    const half = E.layout.road.width / 2;
    const v = ctx.cruiseV();
    const vC = r.range(4.5, 5.5);
    const dC = -(half - 0.9);
    const behind = (v - vC) * W + 20;
    let sObst = ctx.straightNear(ctx.egoS(tCue) + behind + vC * 3.4, 60, 40);
    tCue = ctx.egoT(sObst - vC * 3.4 - behind) ?? tCue;
    if (tCue < ctx.lastT + 3) {
      sObst = ctx.straightAfter(ctx.egoS(ctx.lastT + 3) + behind + vC * 3.4, 60, 40);
      tCue = ctx.egoT(sObst - vC * 3.4 - behind) ?? tCue;
    }
    const sC0 = sObst - vC * 3.4;
    ctx.noPark.push([sC0 - vC * tCue - 10, sObst - 6, -1]);
    ctx.noPark.push([sObst + 6, sObst + vC * 70, -1]);
    ctx.park(sObst, -1, { type: r.chance(0.5) ? 'van' : undefined, dAbs: half - 0.95, color: '#f2f2f0', style: 'suv' });
    const keys = [
      [0, sC0 - vC * tCue, dC],
      [tCue, sC0, dC],
      [tCue + 1.0, sC0 + vC, dC + 0.1],
      [tCue + 2.6, sC0 + vC * 2.6, E.egoD + 0.2],
      [tCue + 5.6, sObst + vC * 2.2, E.egoD + 0.2],
      [tCue + 8, sObst + vC * 4.6, dC],
      [tCue + 60, sObst + vC * 56.6, dC],
    ];
    ctx.actor({ type: 'cyclist', keys, look: [[tCue - 0.1, tCue + 0.8, 1.2]], hazardActor: true });
    ctx.after.push(() => {
      for (let k = 0; k < 3; k++) {
        const tp = tCue + 2 + k * 2.3;
        const sp = sObst + vC * (tp - tCue - 3.4);
        const vo = E.oncomingV[0];
        ctx.actor({ type: 'car', keys: [[-5, sp + vo * (tp + 5), E.oncomingD], [160, sp - vo * (160 - tp), E.oncomingD]] });
      }
    });
    ctx.noOncoming.push([tCue, tCue + 19]);
    const tr = new Track(keys);
    const tmp = [];
    const tOver = tCue + 9.5;
    ctx.lat.push([tOver - 0.5, E.egoD], [tOver + 1.5, E.egoD + 1.6], [tOver + 5.5, E.egoD + 1.6], [tOver + 7.5, E.egoD]);
    ctx.event({
      cueT: tCue, check: [tCue, tOver], vMin: vC, vAfter: ctx.v0,
      limit: (t) => (t < tOver ? (tr.at(t, tmp), tmp[0] - 10) : null),
      resumeT: tOver,
      label: 'A cyclist moves out to pass a parked vehicle',
      desc: "The cyclist looked over their shoulder and moved out towards the middle of the lane. Hold back and don't try to squeeze past; overtake later, leaving at least 1.5 metres (rule 163).",
    });
  },
};

// An oncoming car overtakes a slow vehicle and comes onto our side of the road.
T.oncomingOvertaker = {
  envs: ['rural'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const W = ctx.win();
    const v = ctx.cruiseV();
    const half = E.layout.road.width / 2;
    const vO = r.range(16, 19);
    const slow = r.pick(['tractor', 'cyclist', 'tractor']);
    const vS = slow === 'cyclist' ? 6 : 7.5;
    const Ls = slow === 'tractor' ? 3.6 : 1.8;
    tCue = Math.max(tCue, ctx.lastT + 3);
    // far enough away that, at our normal speed, we'd still be 40 m apart when it gets back to its side
    const moved = (Ls / 2 + 7.2) + (Ls / 2 + 13) + vS * 5.6;
    let D = 40 + v * 5.6 + moved;
    const sNow = ctx.egoS(tCue);
    let best = null;
    for (const [s0, s1] of ctx.straights) {
      const a0 = Math.max(s0 + 5, sNow);
      if (s1 - a0 >= D + 25) { best = a0; break; }
    }
    if (best == null) { // use the longest straight ahead and shorten the approach
      const cands = ctx.straights.filter(([s0, s1]) => s1 > sNow + 60).sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]));
      const [s0, s1] = cands[0] || [sNow, sNow + D + 25];
      best = Math.max(s0 + 5, sNow);
      D = Math.max(120, s1 - best - 25);
    }
    tCue = Math.max(ctx.lastT + 3, ctx.egoT(best) ?? tCue);
    const sO0 = ctx.egoS(tCue) + D;
    // the slow vehicle is ahead of the overtaker in its direction of travel (towards us, so smaller s)
    const behind = Ls / 2 + 2.2 + 5;
    const sSlow = (t) => sO0 - behind - vS * (t - tCue);
    const dS = half - 1.25;
    ctx.actor({ type: slow, opts: slow === 'tractor' ? { color: r.pick(['#2f6b2f', '#b3261e', '#1f4e8c']) } : {}, keys: [[-5, sSlow(-5), dS], [160, sSlow(160), dS]], visible: [[tCue - 25, tCue + 16]] });
    // overtaker: follows the slow vehicle, pulls out at the cue, passes it on our side, then cuts back in
    const ahead = (t, extra) => sSlow(t) - extra;
    const oKeys = [
      [-5, sSlow(-5) + behind, E.oncomingD],
      [tCue - 0.3, sSlow(tCue - 0.3) + behind, E.oncomingD],
      [tCue + 1.4, sSlow(tCue + 1.4) + behind - 3, -0.2],
      [tCue + 2.8, ahead(tCue + 2.8, -Ls / 2 + 1), -1.3],
      [tCue + 4.2, ahead(tCue + 4.2, Ls / 2 + 6), -1.0],
      [tCue + 5.6, ahead(tCue + 5.6, Ls / 2 + 13), E.oncomingD],
      [160, ahead(tCue + 5.6, Ls / 2 + 13) - vO * (160 - tCue - 5.6), E.oncomingD],
    ];
    ctx.actor({ type: 'car', opts: { style: r.pick(['saloon', 'hatch', 'estate']) }, keys: oKeys, indR: [[tCue - 1, tCue + 1.4]], indL: [[tCue + 3.4, tCue + 5]], hazardActor: true, visible: [[tCue - 25, 200]] });
    ctx.noOncoming.push([tCue - 3, tCue + 32]);
    const tr = new Track(oKeys);
    const tmp = [];
    ctx.lat.push([tCue + W - 0.5, E.egoD], [tCue + W + 1.2, E.egoD - 0.5], [tCue + W + 5, E.egoD - 0.5], [tCue + W + 7, E.egoD]);
    ctx.event({
      cueT: tCue, check: [tCue, tCue + 6.5], vMin: v * 0.5, vAfter: ctx.v0, decel: 3.0, brakeAt: tCue + W - 0.6,
      limit: (t) => { tr.at(t, tmp); return tmp[1] < 0.4 ? tmp[0] - 35 : null; },
      resumeT: tCue + 6.2,
      label: 'An oncoming vehicle overtakes onto your side of the road',
      desc: 'The car behind the slow vehicle pulled out to overtake and came towards you on your side of the road. Slow down and keep left.',
    });
  },
};

// A pedestrian waiting by a zebra crossing steps onto it.
T.zebra = {
  envs: ['town', 'residential', 'village'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const W = ctx.win();
    const half = E.layout.road.width / 2;
    const P = ctx.place(tCue, W, 0, 3.2, 40, 35);
    const sZ = P.s + 5;
    tCue = P.t;
    ctx.crossings.push({ s: sZ, kind: 'zebra' });
    ctx.noScenery.push([sZ - 4, sZ + 4]);
    ctx.noPeds.push([sZ - 22, sZ + 22]);
    ctx.signs.push({ s: sZ - 80, side: -1, img: SIGN.zebra, size: 0.85, h: 1.7, aspect: 1.15 });
    const side = r.pick([-1, 1]);
    const pd = side * (half + 1.2);
    const tStep = tCue + W * 0.6;
    const walkDir = r.chance(0.5) ? 1 : -1;
    const keys = [[0, sZ - walkDir * 1.3 * (tCue - 1), pd], [tCue - 1, sZ, pd], [tCue, sZ + 0.1, side * (half + 0.5)], [tStep, sZ, side * (half - 0.4)], [tStep + 6.5, sZ, -side * (half - 0.6)], [tStep + 8, sZ + 0.2, -side * (half + 1.2)], [tStep + 30, sZ + walkDir * 30, -side * (half + 1.2)]];
    const elderly = r.chance(0.3);
    ctx.actor({ type: 'person', opts: { elderly, bag: r.chance(0.5) }, keys, look: [[tCue - 0.6, tCue + 0.6, side < 0 ? -1.2 : 1.2]], hazardActor: true });
    ctx.actor({ type: 'person', keys: [[0, sZ - 25, -side * (half + 1.6)], [tCue + 20, sZ + 10, -side * (half + 1.6)]] });
    ctx.noOncoming.push([tStep - 1.5, tStep + 8]);
    ctx.event({
      cueT: tCue, check: [tCue, tStep + 7], vMin: 0, limit: (t) => (t < tStep + 7 ? sZ - 5 : null), resumeT: tStep + 7.2,
      label: 'A pedestrian steps onto a zebra crossing',
      desc: 'The person walked to the kerb at the crossing and looked at the traffic. You MUST give way once someone has moved onto a zebra crossing (rule 195).',
    });
  },
};

// Horse riders appear round a bend on a country lane.
T.horses = {
  envs: ['rural'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const half = E.layout.road.width / 2;
    const vH = r.range(1.6, 2.4);
    // put them just past a bend so they appear as we come round it
    const bend = ctx.bendNear(ctx.egoS(Math.max(tCue, ctx.lastT + 3)) + 60);
    const W = ctx.win();
    const v = ctx.cruiseV();
    const slowDist = (v * v - 3.6 * 3.6) / (2 * 3.2) + 15;
    // first seen as we come round the bend; far enough beyond it to give a normal-length window
    const seeAt = bend ? bend.start + bend.len * 0.55 : ctx.egoS(tCue);
    let sH0 = seeAt + v * W + slowDist;
    let tSee = ctx.egoT(seeAt) ?? tCue;
    for (let it = 0; it < 4; it++) {
      // first moment the riders come into view (they move at vH)
      let seen = null;
      for (let t = Math.max(ctx.lastT + 2, tSee - 8); t < tSee + 12; t += 0.1) {
        if (ctx.canSee(ctx.egoS(t), E.egoD + 0.38, sH0 + vH * (t - tSee), -(half - 0.9), 2.3)) { seen = t; break; }
      }
      if (seen == null) { sH0 -= 25; continue; }
      const gap = sH0 + vH * (seen - tSee) - ctx.egoS(seen);
      const need = v * W + slowDist;
      sH0 += need - gap - vH * (seen - tSee);
      tSee = seen;
      if (Math.abs(need - gap) < 6) break;
    }
    ctx.signs.push({ s: (bend ? bend.start : sH0) - 120, side: -1, img: SIGN.horses, size: 0.9, h: 1.6, aspect: 1.15 });
    const two = r.chance(0.6);
    const sAt = (t) => sH0 + vH * (t - tSee);
    for (let k = 0; k < (two ? 2 : 1); k++) {
      ctx.actor({ type: 'horse', keys: [[tSee - 60, sAt(tSee - 60) - k * 3.2, -(half - 0.9)], [tSee + 60, sAt(tSee + 60) - k * 3.2, -(half - 0.9)]], hazardActor: true });
    }
    const last = (t) => sAt(t) - (two ? 3.2 : 0) - 2;
    const tPass = tSee + 14;
    ctx.lat.push([tPass - 1, E.egoD], [tPass + 1.6, 1.0], [tPass + 6.5, 1.0], [tPass + 8.5, E.egoD]);
    ctx.noOncoming.push([tSee - 3, tPass + 9]);
    ctx.event({
      cueT: tSee, check: [tSee, tPass], vMin: 3.6, vAfter: ctx.v0, decel: 3.2,
      limit: (t) => (t < tPass ? last(t) - 15 : null),
      resumeT: tPass + 6.5, accel: 1.4,
      label: 'Horse riders on the road ahead',
      desc: 'Horses can be startled easily. Slow right down and pass wide and slow — no more than 10 mph and at least 2 metres away — when it is safe (rule 215).',
    });
  },
};

// A tractor pulls out of a field gateway.
T.tractorOut = {
  envs: ['rural'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const W = ctx.win();
    const half = E.layout.road.width / 2;
    const P = ctx.place(tCue, W, 0, 3.2, 50, 30);
    const sG = P.s + 10;
    tCue = P.t;
    ctx.junctions.push({ s: sG, side: -1, width: 6, kind: 'gate' });
    ctx.noScenery.push([sG - 6, sG + 6, -1]);
    const tMove = tCue + W * 0.3;
    const vT = 6.5;
    const keys = [[0, sG, -(half + 5)], [tCue - 0.5, sG, -(half + 4.6)], [tMove, sG, -(half + 2.9)], [tMove + 2.3, sG + 2.6, -(half - 0.5)], [tMove + 3.9, sG + 8, E.egoD], [tMove + 60, sG + 8 + vT * 56, E.egoD]];
    ctx.actor({ type: 'tractor', opts: { color: r.pick(['#2f6b2f', '#b3261e', '#1f4e8c']) }, keys, yaw0: -Math.PI / 2, hazardActor: true });
    const tr = new Track(keys);
    const tmp = [];
    ctx.noOncoming.push([tMove, tMove + 25]);
    const tOver = tMove + 16;
    ctx.lat.push([tOver - 0.5, E.egoD], [tOver + 2, 1.4], [tOver + 6, 1.4], [tOver + 8, E.egoD]);
    ctx.event({
      cueT: tCue, check: [tCue, tOver], vMin: vT, vAfter: ctx.v0,
      limit: (t) => (t < tMove + 1 ? sG - 10 : t < tOver ? (tr.at(t, tmp), tmp[0] - 14) : null),
      resumeT: tOver,
      label: 'A tractor pulls out of a field',
      desc: 'The tractor in the field gateway started to move towards the road. Be ready to slow right down behind slow farm vehicles.',
    });
  },
};

// A deer runs across a country road (often at dusk or night).
T.deer = {
  envs: ['rural'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const W = r.range(3.2, 4.0);
    const half = E.layout.road.width / 2;
    tCue = Math.max(tCue, ctx.lastT + 3);
    const sD = ctx.lead(tCue, W, 9, 4.5);
    ctx.signs.push({ s: sD - 220, side: -1, img: SIGN.wild, size: 0.9, h: 1.6, aspect: 1.15 });
    const side = r.pick([-1, 1]);
    const tc = tCue + W * 0.4;
    const hide = ctx.sightLimit(side);
    ctx.actor({ type: 'deer', keys: [[0, sD - 6, side * (hide + 2.5)], [tCue - 0.6, sD - 5.5, side * (hide + 1.2)], [tCue, sD - 4.5, side * (hide - 0.3)], [tc, sD - 2.5, side * (half + 0.6)], [tc + 1.2, sD, 0], [tc + 2.4, sD + 2.5, -side * (half + 1.5)], [tc + 6, sD + 9, -side * (half + 12)]], hazardActor: true });
    if (r.chance(0.5)) ctx.actor({ type: 'deer', keys: [[0, sD - 8, side * (hide + 3)], [tc + 0.8, sD - 8, side * (hide + 1)], [tc + 2.3, sD - 4, 0], [tc + 3.5, sD - 1, -side * (half + 1.5)], [tc + 7, sD + 5, -side * (half + 12)]], hazardActor: true });
    ctx.noOncoming.push([tCue - 2, tc + 6]);
    ctx.event({
      cueT: tCue, check: [tCue, tc + 5], vMin: 0, decel: 4.5, limit: (t) => (t < tc + 4.8 ? sD - 9 : null), resumeT: tc + 4.8,
      label: 'A deer runs into the road',
      desc: 'A deer appeared on the verge and ran across. Where there is one deer there are often more following.',
    });
  },
};

// Traffic queuing ahead on a fast road.
T.queue = {
  envs: ['dual', 'motorway'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const v = ctx.cruiseV();
    ctx.noLaneTraffic = true;
    const gap = v * 2.6 + 6;
    const Tb = r.range(12, 14);
    const sL0 = ctx.egoS(tCue) + gap;
    const sStop = sL0 + (v * Tb) / 2;
    const lanes = E.lanes;
    const leadKeys = [[0, sL0 - v * tCue, E.egoD], [tCue, sL0, E.egoD], [tCue + Tb * 0.5, sStop - (v * Tb) / 8, E.egoD], [tCue + Tb, sStop, E.egoD], [tCue + Tb + 3, sStop + 2, E.egoD], [tCue + Tb + 8, sStop + 30, E.egoD], [tCue + 80, sStop + 30 + 72 * v * 0.8, E.egoD]];
    ctx.actor({ type: r.chance(0.3) ? 'lorry' : 'car', keys: leadKeys, brake: [[tCue, tCue + Tb + 3]], hazard: [[tCue + 1.8, tCue + Tb + 2]], hazardActor: true });
    const leadTr = new Track(leadKeys);
    for (const lane of lanes) {
      let off = lane === E.egoD ? 0 : r.range(-14, 4);
      for (let k = 0; k < 4; k++) {
        const type = r.chance(0.25) ? 'lorry' : r.chance(0.2) ? 'van' : 'car';
        off += (type === 'lorry' ? 15 : 9) + r.range(2, 5);
        const dt = 0.45 * (k + 1);
        const ks = [];
        const tmpL = [];
        for (let t = -5; t <= tCue + Tb + 12; t += 0.5) { leadTr.at(t + dt, tmpL); ks.push([t, tmpL[0] + off, lane]); }
        ks.push([tCue + 80, ks[ks.length - 1][1] + 66 * v * 0.8, lane]);
        ctx.actor({ type, keys: ks, brake: [[tCue - dt, tCue + Tb + 3 - dt]], hazard: k === 3 && lane === E.egoD ? [[tCue + 1, tCue + Tb]] : null });
        if (type === 'lorry') off += 4;
      }
    }
    ctx.signs.push({ s: ctx.egoS(tCue) - 300, side: -1, img: SIGN.queues, size: 1.1, h: 1.8, aspect: 1.15, d: E.layout.carriageways[0].d0 - 1.4 });
    ctx.noOncoming.push([tCue - 4, tCue + Tb + 8]);
    const tr = new Track(leadKeys);
    const tmp = [];
    ctx.event({
      cueT: tCue, check: [tCue, tCue + Tb + 3], vMin: 0, decel: 3.0, vAfter: ctx.v0 * 0.8,
      limit: (t) => (tr.at(t, tmp), tmp[0] - 12), resumeT: tCue + Tb + 3.4, accel: 2.0,
      label: 'Traffic is slowing and queuing ahead',
      desc: 'Brake lights came on ahead and the traffic started to bunch up, with hazard warning lights to warn of the queue (rule 116). Ease off early so you can stop safely.',
    });
  },
};

// A vehicle cuts into our lane on a fast road and brakes.
T.laneCutIn = {
  envs: ['dual', 'motorway'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const v = ctx.cruiseV();
    ctx.noLaneTraffic = true;
    const other = E.lanes[1];
    const vO = v - 2;
    const W = ctx.win();
    const s0 = ctx.egoS(tCue) + 30 + 3 * W;
    const tIn = tCue + W * 0.6;
    const keys = [[0, s0 - vO * tCue, other], [tCue, s0, other], [tIn, s0 + vO * (tIn - tCue), (other + E.egoD) / 2], [tIn + 1.4, s0 + vO * (tIn - tCue + 1.4), E.egoD], [tIn + 4, s0 + vO * (tIn - tCue + 1.4) + (vO - 7) * 2.6, E.egoD], [tIn + 8, s0 + vO * (tIn - tCue + 1.4) + (vO - 7) * 2.6 + (vO - 9) * 4, E.egoD], [tIn + 60, s0 + vO * (tIn - tCue + 1.4) + (vO - 7) * 2.6 + (vO - 9) * 4 + v * 52, E.egoD]];
    ctx.actor({ type: r.chance(0.3) ? 'van' : 'car', opts: { style: r.pick(['saloon', 'estate', 'suv']) }, keys, indL: [[tCue, tIn + 1.6]], brake: [[tIn + 1.2, tIn + 7]], hazardActor: true });
    ctx.noOncoming.push([tCue - 3, tIn + 9]);
    const tr = new Track(keys);
    const tmp = [];
    ctx.event({
      cueT: tCue, check: [tCue, tIn + 9], vMin: vO - 10, decel: 2.6, vAfter: ctx.v0,
      limit: (t) => (t > tIn - 0.4 ? (tr.at(t, tmp), tmp[0] - (v * 0.7 + 4)) : null), resumeT: tIn + 7,
      label: 'A vehicle moves into your lane and slows down',
      desc: 'The vehicle in the next lane signalled left and moved in close in front of you, then braked. Ease off to get back a safe two-second gap.',
    });
  },
};

// A car reverses out of a driveway.
T.reversing = {
  envs: ['residential'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const W = ctx.win();
    const half = E.layout.road.width / 2;
    const P = ctx.place(tCue, W, 0, 3.2, 18, 15);
    const sD = P.s + 9;
    tCue = P.t;
    const side = r.pick([-1, 1]);
    ctx.junctions.push({ s: sD, side, width: 3.2, kind: 'drive' });
    ctx.noPark.push([sD - 6, sD + 6, side]);
    ctx.noScenery.push([sD - 2, sD + 2, side]);
    const tMove = tCue + W * 0.25;
    const start = side * (half + 6.5);
    // it backs out, swinging its rear towards where we've come from, then drives off in its own lane
    const back = side < 0 ? -3 : 3;
    const laneD = side < 0 ? E.egoD : E.oncomingD;
    const dirS = side < 0 ? 1 : -1;
    const vEnd = ctx.v0 + 2;
    const keys = [[0, sD, start], [tMove, sD, start], [tMove + 2.8, sD, side * (half - 0.5)], [tMove + 4.8, sD + back * 0.8, side * (half - 2.2)], [tMove + 7.6, sD + back, laneD], [tMove + 9.6, sD + back + dirS * 5, laneD], [tMove + 16, sD + back + dirS * (5 + 6.4 * ((4 + vEnd) / 2)), laneD], [tMove + 90, sD + back + dirS * (5 + 6.4 * ((4 + vEnd) / 2) + 74 * vEnd), laneD]];
    ctx.actor({ type: 'car', opts: { style: r.pick(['hatch', 'estate', 'suv']) }, keys, rev: [[tMove - 0.1, tMove + 7.5]], revLights: [[tCue, tMove + 7.5]], yaw0: side < 0 ? -Math.PI / 2 : Math.PI / 2, hazardActor: true, leaveAhead: side < 0 });
    ctx.noOncoming.push([tMove, tMove + 12]);
    ctx.event({
      cueT: tCue, check: [tCue, tMove + 10], vMin: 0, limit: (t) => (t < tMove + 9.6 ? sD - 9 : null), resumeT: tMove + 9.2, vAfter: ctx.v0 * 0.9,
      label: 'A car reverses out of a driveway',
      desc: "The car's reversing lights came on and it started to back out across the pavement into the road.",
    });
  },
};

// A child runs out from behind an ice-cream van.
T.iceCream = {
  envs: ['residential'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const W = ctx.win();
    const half = E.layout.road.width / 2;
    const P = ctx.place(tCue, W, 0, 4, 18, 15);
    const sV = P.s + 10;
    tCue = P.t;
    ctx.noPark.push([sV - 12, sV + 12, 1]);
    ctx.noPark.push([sV - 14, sV + 4, -1]);
    ctx.parked.push({ s: sV, side: 1, d: half - 1.0, type: 'van', color: '#f6d6e4', flip: true });
    ctx.noPeds.push([sV - 16, sV + 16]);
    for (let k = 0; k < 2; k++) ctx.actor({ type: 'child', keys: [[0, sV - 1 + k * 1.3, half + 0.9 + k * 0.4], [80, sV - 1 + k * 1.3, half + 0.9 + k * 0.4]], yaw0: Math.PI / 2 });
    const tRun = tCue + W * 0.3;
    const keys = [[0, sV - 3, half + 1.1], [tCue - 0.3, sV - 3, half + 1.1], [tRun, sV - 3.6, half - 0.6], [tRun + 1.0, sV - 4.2, half - 2.6], [tRun + 2.2, sV - 4.6, E.egoD + 0.5], [tRun + 3.6, sV - 4.8, -(half - 0.5)], [tRun + 4.6, sV - 4.8, -(half + 1.2)], [tRun + 30, sV + 20, -(half + 1.2)]];
    ctx.actor({ type: 'child', keys, hazardActor: true });
    ctx.noOncoming.push([tCue - 2, tRun + 5]);
    ctx.event({
      cueT: tCue, check: [tCue, tRun + 4.5], vMin: 0, decel: 4, limit: (t) => (t < tRun + 4.5 ? sV - 10 : null), resumeT: tRun + 4.2,
      label: 'A child runs out from behind an ice-cream van',
      desc: 'Ice-cream vans attract children, who may run into the road without looking. The hazard starts as the child moves out past the van.',
    });
  },
};

// A parked car's door opens into the road.
T.doorOpens = {
  envs: ['residential', 'town'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const W = r.range(3.4, 4.4);
    const half = E.layout.road.width / 2;
    const P = ctx.place(tCue, W, 0, 3.2, 16, 10);
    const sP = P.s + 8;
    tCue = P.t;
    const dPark = -(E.parkD || half - 0.95);
    ctx.noPark.push([sP - 6, sP + 6, -1]);
    const doorT = tCue + 0.2;
    ctx.actor({ type: 'car', opts: { style: r.pick(['hatch', 'saloon', 'estate']) }, keys: [[0, sP, dPark], [80, sP, dPark]], door: [[doorT, doorT + 6.5]], yaw0: 0, hazardActor: true, group: 'door' });
    ctx.actor({ type: 'person', group: 'door', keys: [[0, sP - 0.3, dPark + 0.4], [doorT + 1.0, sP - 0.3, dPark + 0.4], [doorT + 2.2, sP - 0.4, dPark + 1.3], [doorT + 4.5, sP - 0.4, dPark + 1.4], [doorT + 7, sP + 3, dPark + 1.4], [doorT + 9, sP + 3.4, -(half + 1)], [doorT + 40, sP + 40, -(half + 1)]], visible: [[doorT + 1.0, 200]], hazardActor: true });
    ctx.noOncoming.push([tCue - 1, tCue + 9]);
    ctx.event({
      cueT: tCue, check: [tCue, doorT + 7], vMin: 0, limit: (t) => (t < doorT + 7 ? sP - 8 : null), resumeT: doorT + 6.8,
      label: 'A car door opens into the road',
      desc: "The parked car's door swung open and the driver started to get out into your path. Give parked cars plenty of room where you can (rule 163).",
    });
  },
};

// A dog runs off the pavement into the road.
T.dog = {
  envs: ['residential', 'village'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const W = r.range(3.4, 4.4);
    const half = E.layout.road.width / 2;
    const side = r.pick([-1, 1]);
    const cfg = side < 0 ? E.layout.left : E.layout.right;
    if (!cfg.pavement) return T.dog.run(ctx, tCue); // pick again (village roads may lack a pavement)
    const P = ctx.place(tCue, W, 0, 4, 16, 16);
    const sD = P.s + 8;
    tCue = P.t;
    ctx.noPark.push([sD - 12, sD + 16]);
    ctx.noPeds.push([sD - 16, sD + 16]);
    const owner = [[0, sD - 30, side * (half + 1.2)], [tCue - 1, sD - 2, side * (half + 1.2)], [tCue + 2, sD + 0.5, side * (half + 0.8)], [tCue + 6, sD + 2, side * (half + 0.4)], [tCue + 30, sD + 30, side * (half + 1.2)]];
    ctx.actor({ type: 'person', keys: owner });
    const tc = tCue + 0.3;
    ctx.actor({ type: 'dog', keys: [[0, sD - 29, side * (half + 0.8)], [tCue - 0.8, sD - 0.5, side * (half + 0.8)], [tc, sD + 1.2, side * (half - 0.3)], [tc + 1.5, sD + 4, E.egoD + 0.4], [tc + 3.0, sD + 7, -side * (half - 1)], [tc + 4.5, sD + 9, side * 0.3], [tc + 7, sD + 6, side * (half + 0.8)], [tc + 30, sD + 32, side * (half + 0.8)]], hazardActor: true });
    ctx.noOncoming.push([tCue - 1, tc + 7.5]);
    ctx.event({
      cueT: tCue, check: [tCue, tc + 6.5], vMin: 0, decel: 4, limit: (t) => (t < tc + 6.5 ? sD - 8 : null), resumeT: tc + 6.2,
      label: 'A dog runs into the road',
      desc: "A dog that wasn't on a lead ran off the pavement. Animals are unpredictable (rule 214).",
    });
  },
};

// A school crossing patrol steps out with their sign.
T.schoolPatrol = {
  envs: ['residential', 'town', 'village'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const W = ctx.win();
    const half = E.layout.road.width / 2;
    const P = ctx.place(tCue, W, 0, 3.2, 36, 25);
    const sX = P.s + 7;
    tCue = P.t;
    ctx.noPark.push([sX - 25, sX + 15]);
    ctx.noPeds.push([sX - 22, sX + 22]);
    ctx.markings.push({ text: 'SCHOOL', s: sX - 28, d: E.egoD, w: 2.6, l: 5.5, color: '#e5c21a' });
    const side = -1;
    const tOut = tCue + W * 0.4;
    ctx.actor({ type: 'person', opts: { hiVis: true }, keys: [[0, sX - 0.5, side * (half + 0.6)], [tCue, sX - 0.5, side * (half + 0.6)], [tOut, sX - 0.4, side * (half - 0.4)], [tOut + 2.5, sX, 0], [tOut + 9, sX, 0.2], [tOut + 11, sX + 0.3, side * (half + 0.6)], [80, sX + 0.3, side * (half + 0.6)]], look: [[tCue - 0.8, tCue + 0.5, 1.2]], lollipop: true, hazardActor: true });
    for (let k = 0; k < r.int(2, 4); k++) {
      const delay = tOut + 2.4 + k * 0.5;
      ctx.actor({ type: 'child', opts: { bag: true }, keys: [[0, sX - 1.5 - k * 0.8, side * (half + 1.4)], [delay, sX - 0.8 - k * 0.3, side * (half + 0.3)], [delay + 5, sX - 0.8 - k * 0.3, -side * (half + 0.5)], [delay + 30, sX + 25 + k, -side * (half + 1.3)]] });
    }
    ctx.noOncoming.push([tOut, tOut + 11]);
    ctx.event({
      cueT: tCue, check: [tCue, tOut + 10], vMin: 0, limit: (t) => (t < tOut + 10 ? sX - 7 : null), resumeT: tOut + 10.5,
      label: 'A school crossing patrol steps into the road',
      desc: 'The patrol looked at the traffic and stepped out with their STOP sign. You MUST stop when they signal you to (rule 210).',
    });
  },
};

// An oncoming car turns right across our path into a side road on the left.
T.oncomingTurnsAcross = {
  envs: ['town', 'residential', 'village'],
  run(ctx, tCue) {
    const r = ctx.r, E = ctx.E;
    const W = ctx.win();
    const half = E.layout.road.width / 2;
    const P = ctx.place(tCue, W, 0, 3.6, 42, 35);
    const sJ = P.s + 7;
    tCue = P.t;
    ctx.junctions.push({ s: sJ, side: -1, width: 6.5, len: 60 });
    ctx.noPark.push([sJ - 14, sJ + 14]);
    const vO = 10;
    const tTurn = tCue + W * 0.5;
    const keys = [[-5, sJ + 3 + vO * (tCue + 5 + (tTurn - tCue)), E.oncomingD], [tCue, sJ + 3 + vO * (tTurn - tCue) * 0.75, E.oncomingD], [tTurn, sJ + 3, E.oncomingD * 0.5], [tTurn + 1.4, sJ - 0.5, -1.8], [tTurn + 2.7, sJ - 1.6, -(half + 4)], [tTurn + 12, sJ - 1.6, -(half + 60)]];
    ctx.actor({ type: 'car', opts: { style: r.pick(['hatch', 'saloon', 'suv']) }, keys, indR: [[tCue - 3, tTurn + 2]], hazardActor: true });
    ctx.noOncoming.push([tCue - 3.5, tTurn + 3]);
    ctx.event({
      cueT: tCue, check: [tCue, tTurn + 3], vMin: 0, decel: 3.6, limit: (t) => (t < tTurn + 2.6 ? sJ - 7 : null), resumeT: tTurn + 2.4,
      label: 'An oncoming car turns right across your path',
      desc: "The oncoming car was signalling right and didn't wait for you to pass before turning into the side road.",
    });
  },
};

// ---- Clip assembly ---------------------------------------------------------------------------------

const CONDITIONS = {
  residential: [['day', 'clear', 5], ['day', 'overcast', 3], ['day', 'rain', 1.5], ['dusk', 'clear', 1], ['night', 'clear', 1]],
  town: [['day', 'clear', 5], ['day', 'overcast', 3], ['day', 'rain', 1.5], ['dusk', 'clear', 1], ['night', 'clear', 1]],
  village: [['day', 'clear', 5], ['day', 'overcast', 3], ['day', 'rain', 1], ['dusk', 'clear', 1]],
  rural: [['day', 'clear', 5], ['day', 'overcast', 3], ['day', 'rain', 1], ['day', 'fog', 1], ['dusk', 'clear', 1.2], ['night', 'clear', 1]],
  dual: [['day', 'clear', 5], ['day', 'overcast', 3], ['day', 'rain', 1.5], ['day', 'fog', 0.8], ['night', 'clear', 1]],
  motorway: [['day', 'clear', 5], ['day', 'overcast', 3], ['day', 'rain', 1.5], ['day', 'fog', 0.8], ['night', 'clear', 1]],
};

function weighted(r, list) {
  const tot = list.reduce((a, x) => a + x[x.length - 1], 0);
  let x = r() * tot;
  for (const it of list) { x -= it[it.length - 1]; if (x <= 0) return it; }
  return list[list.length - 1];
}

export const TEMPLATE_NAMES = Object.keys(T);
// templates that start with a road user ahead of us in our lane
const LEADS = ['carAheadTurns', 'cyclistMovesOut', 'queue', 'laneCutIn'];
// templates that end with a vehicle driving off ahead of us (it would get in the way of a second hazard)
const LEAVERS = ['emergingCar', 'parkedCarPullsOut', 'busPullsOut', 'reversing'];

// Make one clip. opts: { template, env, double, time, weather }
export function makeClip(seed, opts = {}) {
  // Always draw the same random numbers in the same order, whatever options are given,
  // so a clip can be rebuilt exactly from its seed for review.
  const pre = rng(seed ^ 0x9e3779b9);
  const pickedT = pre.pick(TEMPLATE_NAMES);
  const name = opts.template && T[opts.template] ? opts.template : pickedT;
  const tpl = T[name];
  const pickedE = pre.pick(tpl.envs);
  const envName = opts.env && tpl.envs.includes(opts.env) ? opts.env : pickedE;
  const cond = weighted(pre, CONDITIONS[envName]);
  let [time, weather] = opts.time ? [opts.time, opts.weather || 'clear'] : cond;
  const flip = pre();
  if (name === 'deer' && time === 'day' && flip < 0.6) time = flip < 0.3 ? 'dusk' : 'night';
  if ((name === 'ballChild' || name === 'iceCream' || name === 'schoolPatrol') && time === 'night') time = 'day';
  const ctx = new Ctx(seed, envName, { time, weather });
  const firstRaw = pre();
  const first = opts.short ? 9 + firstRaw * 4 : opts.double ? 14 + firstRaw * 6 : 17 + firstRaw * 17;
  ctx.makeRoute(ctx.v0 * 75, { sharp: envName === 'rural' });
  tpl.run(ctx, first);
  let second = null;
  if (opts.double && !LEAVERS.includes(name)) {
    const others = TEMPLATE_NAMES.filter((n) => n !== name && T[n].envs.includes(envName) && !LEADS.includes(n));
    if (others.length) {
      second = pre.pick(others);
      T[second].run(ctx, ctx.lastT + pre.range(8, 13));
    }
  }
  const tail = pre.range(6, 10);
  const duration = opts.short ? Math.min(45, Math.max(24, ctx.lastT + tail - 2)) : Math.min(72, Math.max(42, ctx.lastT + tail));
  const clip = finish(ctx, duration);
  clip.template = second ? [name, second] : [name];
  clip.title = clip.hazards.map((h) => h.label).join(' · ');
  return clip;
}

// A full test: 14 clips, one with two developing hazards (15 hazards, 75 marks).
export function makeTestPlan(seed, n = 14) {
  const r = rng(seed);
  const names = r.shuffle(TEMPLATE_NAMES);
  const plan = [];
  let doubleIdx = r.int(2, n - 2);
  const envCount = {};
  for (let i = 0; i < n; i++) {
    const template = names[i % names.length];
    const envs = T[template].envs;
    // spread environments across the test
    const env = envs.slice().sort((a, b) => (envCount[a] || 0) - (envCount[b] || 0))[0];
    envCount[env] = (envCount[env] || 0) + 1;
    plan.push({ seed: (seed * 31 + i * 7919) >>> 0, template, env, double: false });
  }
  // the clip with two hazards must be on an ordinary road (not dual carriageway / motorway),
  // and its first hazard mustn't leave a vehicle driving off ahead of us
  const ok = plan.map((p, i) => i).filter((i) => !['dual', 'motorway'].includes(plan[i].env) && !LEAVERS.includes(plan[i].template));
  doubleIdx = ok.includes(doubleIdx) ? doubleIdx : ok[r.int(0, ok.length - 1)];
  plan[doubleIdx].double = true;
  return plan;
}

export { SIGN };
