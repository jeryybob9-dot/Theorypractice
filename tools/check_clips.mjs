// Sanity checks for the hazard clip generator (run with: node tools/check_clips.mjs [seedsPerTemplate])
// For every template and many seeds it reports scoring window lengths and any overlaps (collisions)
// between the camera car, other road users and parked vehicles.
import { makeClip, TEMPLATE_NAMES } from '../js/hpt/scenarios.js';
import { SpeedProfile, Track } from '../js/hpt/road.js';

const N = +(process.argv[2] || 12);
const only = process.argv[3];
const SIZE = { car: [4.3, 1.8], van: [5, 1.95], bus: [11.5, 2.5], lorry: [11.8, 2.55], tractor: [3.6, 2], person: [0.5, 0.5], child: [0.4, 0.4], cyclist: [1.8, 0.6], motorbike: [2.1, 0.8], horse: [2.4, 0.8], dog: [0.7, 0.3], deer: [1.2, 0.4], ball: [0.22, 0.22], pushchair: [0.8, 0.5] };
const EGO = [4.2, 1.8];

function footprint(type, ds, dd) {
  const [l, w] = SIZE[type] || [1, 1];
  // heading mostly across the road (side roads, crossing) -> swap
  return Math.abs(dd) > Math.abs(ds) && Math.abs(dd) > 0.01 ? [w, l] : [l, w];
}

const overlap = (a, b, pad = 0) => Math.abs(a.s - b.s) < (a.l + b.l) / 2 - pad && Math.abs(a.d - b.d) < (a.w + b.w) / 2 - pad;

let problems = 0;
const summary = {};
for (const name of TEMPLATE_NAMES) {
  if (only && name !== only) continue;
  const wins = [], starts = [], durs = [], leads = [];
  for (let k = 0; k < N; k++) {
    const seed = 1000 + k * 7919 + name.length * 31;
    const clip = makeClip(seed, { template: name, double: k % 4 === 3 });
    const ego = new SpeedProfile(clip.ego.speeds, 0, clip.duration + 5);
    const lat = new Track(clip.ego.lat);
    const tracks = clip.actors.map((a) => ({ a, tr: new Track(a.keys) }));
    for (const h of clip.hazards) { wins.push(h.end - h.start); starts.push(h.start); if (h.brakeLead != null) leads.push(h.brakeLead); }
    durs.push(clip.duration);
    const tmp = [], tmp2 = [], l = [];
    const reported = new Set();
    const report = (msg, key) => {
      if (reported.has(key)) return;
      reported.add(key);
      problems++;
      if (problems < 120) console.log(`  [${name} seed ${seed} ${clip.env}] ${msg}`);
    };
    for (let t = 0; t <= clip.duration; t += 0.1) {
      lat.at(t, l);
      const e = { s: ego.s(t), d: l[0], l: EGO[0], w: EGO[1] };
      const boxes = [];
      for (const { a, tr } of tracks) {
        if (a.visible && !a.visible.some(([x, y]) => t >= x && t <= y)) continue;
        tr.at(t, tmp); tr.at(t + 0.1, tmp2);
        const [fl, fw] = footprint(a.type, tmp2[0] - tmp[0], tmp2[1] - tmp[1]);
        boxes.push({ s: tmp[0], d: tmp[1], l: fl, w: fw, a });
      }
      for (const p of clip.parked) boxes.push({ s: p.s, d: p.d, l: p.type === 'van' ? 5 : 4.3, w: 1.85, a: { type: 'parked', id: 'P' + p.s.toFixed(0) } });
      for (const b of boxes) {
        if (b.a.type === 'ball') continue;
        if (overlap(e, b, 0.05)) report(`ego(s=${e.s.toFixed(1)},d=${e.d.toFixed(2)}) hits ${b.a.type}#${b.a.id}(s=${b.s.toFixed(1)},d=${b.d.toFixed(2)},${b.l}x${b.w})${b.a.distractor ? ' (traffic)' : ''}${b.a.hazardActor ? ' (hazard)' : ''} at t=${t.toFixed(1)}`, 'e' + b.a.id);
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i], B = boxes[j];
        if (A.a.type === 'parked' && B.a.type === 'parked') continue;
        const small = ['person', 'child', 'dog', 'ball'];
        if (small.includes(A.a.type) && small.includes(B.a.type)) continue; // people can pass each other
        if (A.a.group && A.a.group === B.a.group) continue; // e.g. a driver getting out of their own car
        if (overlap(A, B, 0.1)) report(`${A.a.type}#${A.a.id}${A.a.distractor ? '(traffic)' : ''}${A.a.hazardActor ? '(hazard)' : ''} hits ${B.a.type}#${B.a.id}${B.a.distractor ? '(traffic)' : ''}${B.a.hazardActor ? '(hazard)' : ''} at t=${t.toFixed(1)} s=${A.s.toFixed(0)}`, A.a.id + ':' + B.a.id);
      }
    }
  }
  const f = (xs) => `${Math.min(...xs).toFixed(1)}–${Math.max(...xs).toFixed(1)}`;
  summary[name] = `windows ${f(wins)}s, brake-after-cue ${leads.length ? f(leads) : '?'}s, starts ${f(starts)}s, durations ${f(durs)}s`;
}
console.log('\n' + Object.entries(summary).map(([k, v]) => `${k.padEnd(20)} ${v}`).join('\n'));
console.log(`\n${problems} problems`);
