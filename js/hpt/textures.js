// Procedural canvas textures for the hazard clips (no image downloads needed, except the official sign images).
import * as THREE from '../../vendor/three.module.min.js';

const cache = new Map();

function canvas(w, hgt) {
  const c = document.createElement('canvas');
  c.width = w; c.height = hgt;
  return c;
}

function noise(ctx, w, hgt, amount, alpha = 1, seed = 1) {
  const img = ctx.getImageData(0, 0, w, hgt);
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n));
    img.data[i + 3] = img.data[i + 3] * alpha;
  }
  ctx.putImageData(img, 0, 0);
}

function tex(c, { repeat = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Road surface: `lanes` is a description across the width, e.g.
// { width: 7, edge: 'none'|'solid', centre: 'dash'|'hazard'|'none'|'double'|'doubleBroken', laneLines: [d...] }
// Texture covers the road width horizontally (u 0..1 = left..right edge) and `period` metres along v.
export function roadTexture(spec, wet = false) {
  const key = 'road:' + JSON.stringify(spec) + wet;
  if (cache.has(key)) return cache.get(key);
  const W = 512, H = 1024;
  const period = spec.period || 12;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const base = wet ? '#3b3d40' : spec.tone || '#55585c';
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  // subtle patches and tyre-polish in the wheel tracks
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(${i % 2 ? '255,255,255' : '0,0,0'},${0.02 + (i % 5) * 0.006})`;
    const x = (i * 97) % W, y = (i * 211) % H;
    g.fillRect(x, y, 30 + ((i * 37) % 120), 40 + ((i * 53) % 200));
  }
  const px = (d) => ((d + spec.width / 2) / spec.width) * W; // d measured from road centre
  const pm = H / period;
  const white = wet ? '#d7d9dc' : '#e9e9e4';
  const line = (d, w, dash, gap, offset = 0, color = white) => {
    g.fillStyle = color;
    const x = px(d) - (w / spec.width) * W / 2;
    const ww = Math.max(2, (w / spec.width) * W);
    if (!dash) { g.fillRect(x, 0, ww, H); return; }
    for (let y = -offset * pm; y < H; y += (dash + gap) * pm) g.fillRect(x, y, ww, dash * pm);
  };
  if (spec.edge === 'solid') {
    line(-spec.width / 2 + 0.25, 0.12, 0, 0);
    line(spec.width / 2 - 0.25, 0.12, 0, 0);
  }
  if (spec.edgeLeft === 'solid') line(-spec.width / 2 + 0.2, 0.15, 0, 0);
  if (spec.edgeRight === 'solid') line(spec.width / 2 - 0.2, 0.15, 0, 0);
  const cd = spec.centreAt || 0;
  if (spec.centre === 'dash') line(cd, 0.1, 3, 9);
  else if (spec.centre === 'hazard') line(cd, 0.12, 6, 3);
  else if (spec.centre === 'double') { line(cd - 0.15, 0.1, 0, 0); line(cd + 0.15, 0.1, 0, 0); }
  else if (spec.centre === 'doubleBroken') { line(cd - 0.15, 0.1, 3, 3); line(cd + 0.15, 0.1, 0, 0); }
  for (const d of spec.laneLines || []) line(d, 0.15, 3, 9);
  noise(g, W, H, 26, 1, 7);
  const t = tex(c, { aniso: 8 });
  t.userData = { period };
  cache.set(key, t);
  return t;
}

export function solidTexture(key, color, amount = 22, size = 128, pattern = null) {
  const k = 'solid:' + key;
  if (cache.has(k)) return cache.get(k);
  const c = canvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  if (pattern) pattern(g, size);
  noise(g, size, size, amount, 1, key.length * 13);
  const t = tex(c);
  cache.set(k, t);
  return t;
}

export function pavementTexture() {
  return solidTexture('pavement', '#a3a3a0', 18, 256, (g, s) => {
    g.strokeStyle = 'rgba(60,60,60,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, (i * s) / 4); g.lineTo(s, (i * s) / 4); g.stroke(); }
    for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo((i * s) / 2, 0); g.lineTo((i * s) / 2, s); g.stroke(); }
  });
}

export function grassTexture(tone = '#5d7f3a') {
  return solidTexture('grass' + tone, tone, 40, 256, (g, s) => {
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${30 + (i % 40)},${70 + (i % 60)},${20 + (i % 30)},0.35)`;
      g.fillRect((i * 73) % s, (i * 151) % s, 2, 5);
    }
  });
}

export function fieldTexture(tone) {
  return solidTexture('field' + tone, tone, 30, 256, (g, s) => {
    g.strokeStyle = 'rgba(0,0,0,0.08)';
    g.lineWidth = 3;
    for (let i = 0; i < s; i += 10) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke(); }
  });
}

export function hedgeTexture() {
  return solidTexture('hedge3', '#d8e6c4', 50, 256, (g, size) => {
    let seed = 12345;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * size, y = rnd() * size, r = 1.5 + rnd() * 4.5;
      const tone = rnd();
      g.fillStyle = tone < 0.55 ? `rgba(60,85,45,${0.35 + rnd() * 0.3})` : tone < 0.85 ? `rgba(150,180,110,${0.3 + rnd() * 0.3})` : `rgba(245,250,225,${0.25 + rnd() * 0.25})`;
      g.beginPath();
      g.ellipse(x, y, r, r * (0.6 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function brickTexture(tone) {
  return solidTexture('brick' + tone, tone, 20, 128, (g, s) => {
    g.fillStyle = 'rgba(230,225,215,0.35)';
    const bh = s / 16;
    for (let r = 0; r < 16; r++) {
      g.fillRect(0, r * bh, s, 1.5);
      const off = r % 2 ? s / 8 : 0;
      for (let x = off; x < s; x += s / 4) g.fillRect(x, r * bh, 1.5, bh);
    }
  });
}

export function glowTexture(color = '255,255,255') {
  const k = 'glow' + color;
  if (cache.has(k)) return cache.get(k);
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, `rgba(${color},1)`);
  grd.addColorStop(0.2, `rgba(${color},0.6)`);
  grd.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = tex(c, { repeat: false });
  cache.set(k, t);
  return t;
}

export function shadowTexture() {
  const k = 'blob';
  if (cache.has(k)) return cache.get(k);
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = tex(c, { repeat: false });
  cache.set(k, t);
  return t;
}

// Text decal on the road (SLOW, KEEP CLEAR, BUS STOP, LOOK RIGHT...)
export function textDecal(text, color = '#efefe8', w = 256, hgt = 512) {
  const k = 'text:' + text + color;
  if (cache.has(k)) return cache.get(k);
  const c = canvas(w, hgt);
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, hgt);
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.translate(w / 2, hgt / 2);
  g.scale(1, 2.6); // road text is elongated so it reads correctly at a low angle
  g.font = `bold ${Math.round(w / Math.max(3, text.length) * 1.25)}px Arial, Helvetica, sans-serif`;
  g.fillText(text, 0, 0);
  g.restore();
  const t = tex(c, { repeat: false });
  cache.set(k, t);
  return t;
}

// Speed limit roundel / national speed limit, drawn to the TSRGD look.
export function speedSign(n) {
  const k = 'speed:' + n;
  if (cache.has(k)) return cache.get(k);
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
  if (n === 'nsl') {
    g.save(); g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.clip();
    g.translate(64, 64); g.rotate(-Math.PI / 4); g.fillStyle = '#111'; g.fillRect(-80, -13, 160, 26); g.restore();
    g.beginPath(); g.arc(64, 64, 61, 0, Math.PI * 2); g.strokeStyle = '#222'; g.lineWidth = 2; g.stroke();
  } else {
    g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.lineWidth = 15; g.strokeStyle = '#d4202b'; g.stroke();
    g.fillStyle = '#111'; g.font = 'bold 54px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(n), 64, 68);
  }
  const t = tex(c, { repeat: false });
  cache.set(k, t);
  return t;
}

// Official Highway Code sign image with its white background made transparent (flood fill from the edges).
export function signTexture(url) {
  const k = 'sign:' + url;
  if (cache.has(k)) return cache.get(k);
  const c = canvas(256, 256);
  const t = tex(c, { repeat: false });
  const img = new Image();
  img.onload = () => {
    const s = Math.min(256 / img.width, 256 / img.height);
    const w = Math.round(img.width * s), hh = Math.round(img.height * s);
    c.width = w; c.height = hh;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, w, hh);
    try {
      const d = g.getImageData(0, 0, w, hh);
      const px = d.data;
      const seen = new Uint8Array(w * hh);
      const stack = [];
      const push = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < hh && !seen[y * w + x]) { seen[y * w + x] = 1; stack.push(y * w + x); } };
      for (let x = 0; x < w; x++) { push(x, 0); push(x, hh - 1); }
      for (let y = 0; y < hh; y++) { push(0, y); push(w - 1, y); }
      while (stack.length) {
        const i = stack.pop();
        const o = i * 4;
        if (px[o] > 225 && px[o + 1] > 225 && px[o + 2] > 225) {
          px[o + 3] = 0;
          const x = i % w, y = (i / w) | 0;
          push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
        }
      }
      g.putImageData(d, 0, 0);
    } catch (e) { /* tainted canvas: keep the background */ }
    t.userData.aspect = w / hh;
    t.needsUpdate = true;
  };
  img.src = url;
  t.userData = { aspect: 1 };
  cache.set(k, t);
  return t;
}

export function plateTexture(lines, { bg = '#ffffff', fg = '#111111', border = '#111111', w = 256, hgt = 128 } = {}) {
  const k = 'plate:' + lines.join('|') + bg + fg;
  if (cache.has(k)) return cache.get(k);
  const c = canvas(w, hgt);
  const g = c.getContext('2d');
  g.fillStyle = border; g.fillRect(0, 0, w, hgt);
  g.fillStyle = bg; g.fillRect(6, 6, w - 12, hgt - 12);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const fs = Math.min(48, (hgt - 20) / lines.length);
  g.font = `bold ${fs}px Arial, Helvetica, sans-serif`;
  lines.forEach((l, i) => g.fillText(l, w / 2, hgt / 2 + (i - (lines.length - 1) / 2) * fs * 1.05));
  const t = tex(c, { repeat: false });
  cache.set(k, t);
  return t;
}

export function shopSignTexture(name, bg, fg) {
  const k = 'shop:' + name + bg;
  if (cache.has(k)) return cache.get(k);
  const c = canvas(512, 64);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 64);
  g.fillStyle = fg; g.font = 'bold 38px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name, 256, 34);
  const t = tex(c, { repeat: false });
  cache.set(k, t);
  return t;
}

export function windowTexture(lit = false) {
  const k = 'win' + lit;
  if (cache.has(k)) return cache.get(k);
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 64, 64);
  if (lit) { grd.addColorStop(0, '#ffe2a0'); grd.addColorStop(1, '#d99a45'); } else { grd.addColorStop(0, '#9fb3c4'); grd.addColorStop(0.5, '#3c4a57'); grd.addColorStop(1, '#6d8090'); }
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, 64, 4); g.fillRect(0, 60, 64, 4); g.fillRect(0, 0, 4, 64); g.fillRect(60, 0, 4, 64); g.fillRect(30, 0, 4, 64); g.fillRect(0, 24, 64, 3);
  const t = tex(c, { repeat: false });
  cache.set(k, t);
  return t;
}
