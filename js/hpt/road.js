// Road geometry and motion timelines for the hazard perception clips.
//
// Everything in a clip is placed in road coordinates (s, d):
//   s = distance along the route's centre line (metres)
//   d = lateral offset, positive to the RIGHT of the direction of travel.
// In the UK we drive on the left, so the camera car's lane has d < 0.

export class Route {
  // segments: [{ len, k }] where k is curvature (1/radius, positive = bends right)
  // elev: [[s, y], ...] smooth height profile (optional)
  constructor(segments, elev = null, step = 0.5) {
    this.step = step;
    const total = segments.reduce((a, g) => a + g.len, 0);
    const n = Math.ceil(total / step) + 2;
    this.len = total;
    this.x = new Float32Array(n);
    this.z = new Float32Array(n);
    this.phi = new Float32Array(n);
    this.k = new Float32Array(n);
    let x = 0, z = 0, phi = 0, s = 0, seg = 0, segStart = 0;
    for (let i = 0; i < n; i++) {
      while (seg < segments.length - 1 && s > segStart + segments[seg].len) { segStart += segments[seg].len; seg++; }
      const k = segments[seg] ? segments[seg].k || 0 : 0;
      this.x[i] = x; this.z[i] = z; this.phi[i] = phi; this.k[i] = k;
      // advance with midpoint heading
      const ph = phi + 0.5 * k * step;
      x += Math.sin(ph) * step;
      z += -Math.cos(ph) * step;
      phi += k * step;
      s += step;
    }
    this.elev = elev && elev.length ? elev : null;
  }

  _idx(s) {
    const f = Math.max(0, Math.min(this.x.length - 1.001, s / this.step));
    const i = Math.floor(f);
    return [i, f - i];
  }

  heading(s) {
    const [i, f] = this._idx(s);
    return this.phi[i] + (this.phi[i + 1] - this.phi[i]) * f;
  }

  curvature(s) {
    return this.k[this._idx(s)[0]];
  }

  height(s) {
    const e = this.elev;
    if (!e) return 0;
    if (s <= e[0][0]) return e[0][1];
    for (let i = 1; i < e.length; i++) {
      if (s <= e[i][0]) {
        const t = (s - e[i - 1][0]) / (e[i][0] - e[i - 1][0]);
        const u = t * t * (3 - 2 * t);
        return e[i - 1][1] + (e[i][1] - e[i - 1][1]) * u;
      }
    }
    return e[e.length - 1][1];
  }

  grade(s) {
    return (this.height(s + 1) - this.height(s - 1)) / 2;
  }

  // World position of road coordinate (s, d) at height y above the road surface.
  // Beyond the ends of the route the road continues straight.
  pos(s, d, y = 0, out = { x: 0, y: 0, z: 0 }) {
    let extra = 0;
    let ss = s;
    if (s < 0) { extra = s; ss = 0; } else if (s > this.len) { extra = s - this.len; ss = this.len; }
    const [i, f] = this._idx(ss);
    const x = this.x[i] + (this.x[i + 1] - this.x[i]) * f;
    const z = this.z[i] + (this.z[i + 1] - this.z[i]) * f;
    const phi = this.phi[i] + (this.phi[i + 1] - this.phi[i]) * f;
    const sx = Math.sin(phi), cz = -Math.cos(phi);
    // right normal = (-dirZ, dirX)
    out.x = x + sx * extra + -cz * d;
    out.z = z + cz * extra + sx * d;
    out.y = this.height(s) + y;
    return out;
  }

  // Yaw (rotation.y) for an object facing along +s at s, plus a relative heading.
  yaw(s, rel = 0) {
    const phi = this.heading(Math.max(0, Math.min(this.len, s))) + rel;
    // model forward is -z; forward (sin phi, -cos phi) => yaw = atan2(-dx, -dz) = -phi
    return -phi;
  }
}

// ---- Speed timelines ---------------------------------------------------------------------------

// keys: [[t, v], ...] with v in m/s, linear between keys. Precomputes s(t).
export class SpeedProfile {
  constructor(keys, s0 = 0, duration = 120, dt = 1 / 50) {
    this.keys = keys.slice().sort((a, b) => a[0] - b[0]);
    this.dt = dt;
    this.s0 = s0;
    const n = Math.ceil(duration / dt) + 2;
    this.sTab = new Float32Array(n);
    let s = s0;
    for (let i = 0; i < n; i++) {
      this.sTab[i] = s;
      const t = i * dt;
      s += 0.5 * (this.v(t) + this.v(t + dt)) * dt;
    }
  }

  v(t) {
    const k = this.keys;
    if (!k.length) return 0;
    if (t <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) {
      if (t <= k[i][0]) {
        const a = k[i - 1], b = k[i];
        return a[1] + (b[1] - a[1]) * ((t - a[0]) / Math.max(1e-6, b[0] - a[0]));
      }
    }
    return k[k.length - 1][1];
  }

  s(t) {
    const f = Math.max(0, t / this.dt);
    const i = Math.min(this.sTab.length - 2, Math.floor(f));
    const u = Math.min(1, f - i);
    return this.sTab[i] + (this.sTab[i + 1] - this.sTab[i]) * u;
  }

  // First time at which s(t) >= s (or null)
  tAt(s) {
    const tab = this.sTab;
    if (s <= tab[0]) return 0;
    let lo = 0, hi = tab.length - 1;
    if (tab[hi] < s) return null;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (tab[m] >= s) hi = m; else lo = m;
    }
    const u = (s - tab[lo]) / Math.max(1e-6, tab[hi] - tab[lo]);
    return (lo + u) * this.dt;
  }
}

// ---- Keyframe tracks ---------------------------------------------------------------------------

// Monotone cubic interpolation of keyframes [[t, a, b, ...], ...] — no overshoot, smooth velocity.
export class Track {
  constructor(keys) {
    this.keys = keys.slice().sort((a, b) => a[0] - b[0]);
    const k = this.keys;
    const n = k.length;
    const dims = n ? k[0].length - 1 : 0;
    this.dims = dims;
    this.m = [];
    for (let d = 0; d < dims; d++) {
      const m = new Float64Array(n);
      const delta = new Float64Array(Math.max(1, n - 1));
      for (let i = 0; i < n - 1; i++) delta[i] = (k[i + 1][d + 1] - k[i][d + 1]) / Math.max(1e-6, k[i + 1][0] - k[i][0]);
      for (let i = 0; i < n; i++) {
        if (i === 0) m[i] = n > 1 ? delta[0] : 0;
        else if (i === n - 1) m[i] = delta[n - 2];
        else if (delta[i - 1] * delta[i] <= 0) m[i] = 0;
        else m[i] = (delta[i - 1] + delta[i]) / 2;
      }
      for (let i = 0; i < n - 1; i++) {
        if (delta[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
        const a = m[i] / delta[i], b = m[i + 1] / delta[i];
        const r = a * a + b * b;
        if (r > 9) {
          const tau = 3 / Math.sqrt(r);
          m[i] = tau * a * delta[i];
          m[i + 1] = tau * b * delta[i];
        }
      }
      this.m.push(m);
    }
    this.t0 = n ? k[0][0] : 0;
    this.t1 = n ? k[n - 1][0] : 0;
  }

  at(t, out = []) {
    const k = this.keys;
    const n = k.length;
    if (!n) return out;
    if (t <= k[0][0]) { for (let d = 0; d < this.dims; d++) out[d] = k[0][d + 1]; return out; }
    if (t >= k[n - 1][0]) { for (let d = 0; d < this.dims; d++) out[d] = k[n - 1][d + 1]; return out; }
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (k[mid][0] <= t) lo = mid; else hi = mid; }
    const h = k[hi][0] - k[lo][0];
    const u = (t - k[lo][0]) / h;
    const u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    for (let d = 0; d < this.dims; d++) {
      out[d] = h00 * k[lo][d + 1] + h10 * h * this.m[d][lo] + h01 * k[hi][d + 1] + h11 * h * this.m[d][hi];
    }
    return out;
  }
}

// Intervals helper: [[t0, t1], ...] -> is t inside any?
export function within(intervals, t) {
  if (!intervals) return false;
  for (const [a, b] of intervals) if (t >= a && t <= b) return true;
  return false;
}
