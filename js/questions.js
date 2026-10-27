// Builds question instances: bank questions, plus questions generated from the Highway Code sign images and tables.
import { TOPICS, MOCK } from './data.js';
import { rng, shuffle } from './util.js';
import { store } from './store.js';

// ---- Generated question sources ---------------------------------------------------------------

// Highway Code rule 126, "Typical stopping distances".
const STOPPING = [
  { mph: 20, think: 6, brake: 6, total: 12 },
  { mph: 30, think: 9, brake: 14, total: 23 },
  { mph: 40, think: 12, brake: 24, total: 36 },
  { mph: 50, think: 15, brake: 38, total: 53 },
  { mph: 60, think: 18, brake: 55, total: 73 },
  { mph: 70, think: 21, brake: 75, total: 96 },
];

// Highway Code rule 124 speed limits table (England, Scotland and Wales).
const LIMITS = {
  car: { name: 'a car', builtUp: 30, single: 60, dual: 70, motorway: 70 },
  towing: { name: 'a car towing a caravan or trailer', builtUp: 30, single: 50, dual: 60, motorway: 60 },
};
const ROAD_NAMES = {
  single: 'a single carriageway road',
  dual: 'a dual carriageway',
  motorway: 'a motorway',
};

function stoppingQuestions() {
  const out = [];
  for (const s of STOPPING) {
    const others = STOPPING.filter((x) => x !== s);
    const near = (key) => {
      const vals = new Set([s[key]]);
      for (const o of others.sort((a, b) => Math.abs(a.mph - s.mph) - Math.abs(b.mph - s.mph))) {
        vals.add(o[key]);
        if (vals.size === 4) break;
      }
      return [...vals];
    };
    out.push({
      id: `GEN-SD-${s.mph}-T`, topic: 'safety-margins', gen: true,
      q: `What is the typical overall stopping distance at ${s.mph} mph on a dry road?`,
      options: near('total').map((v) => `${v} metres`), answer: 0,
      explain: `At ${s.mph} mph the typical stopping distance is ${s.think} metres thinking distance plus ${s.brake} metres braking distance: ${s.total} metres in total. It will be longer on wet or icy roads.`,
      ref: ['HC 126'],
    });
    out.push({
      id: `GEN-SD-${s.mph}-K`, topic: 'safety-margins', gen: true,
      q: `What is the typical thinking distance at ${s.mph} mph?`,
      options: near('think').map((v) => `${v} metres`), answer: 0,
      explain: `Thinking distance at ${s.mph} mph is about ${s.think} metres. This is the distance travelled before you even start to brake, and it's longer if you're tired or distracted.`,
      ref: ['HC 126'],
    });
    out.push({
      id: `GEN-SD-${s.mph}-B`, topic: 'safety-margins', gen: true,
      q: `What is the typical braking distance at ${s.mph} mph on a dry road?`,
      options: near('brake').map((v) => `${v} metres`), answer: 0,
      explain: `The typical braking distance at ${s.mph} mph is ${s.brake} metres, after a thinking distance of ${s.think} metres (${s.total} metres overall).`,
      ref: ['HC 126'],
    });
  }
  return out;
}

function speedLimitQuestions() {
  const out = [];
  for (const [vk, v] of Object.entries(LIMITS)) {
    for (const road of ['single', 'dual', 'motorway']) {
      const correct = v[road];
      const opts = [...new Set([correct, 40, 50, 60, 70].filter((x) => x !== correct))].slice(0, 3);
      out.push({
        id: `GEN-SL-${vk}-${road}`, topic: 'rules-of-the-road', gen: true,
        q: `What is the national speed limit for ${v.name} on ${ROAD_NAMES[road]}, unless signs show otherwise?`,
        options: [`${correct} mph`, ...opts.map((x) => `${x} mph`)], answer: 0,
        explain: `The national speed limit for ${v.name} on ${ROAD_NAMES[road]} is ${correct} mph. Lower limits may be signed, and the limit is a maximum, not a target.`,
        ref: ['HC 124'],
      });
    }
  }
  return out;
}

const GENERATED = [...stoppingQuestions(), ...speedLimitQuestions()];

// ---- Sign questions -------------------------------------------------------------------------

const GROUP_FALLBACK = {
  'order-red': ['order-blue', 'information'],
  'order-blue': ['order-red', 'information'],
  warning: ['order-red', 'information'],
  information: ['order-blue', 'direction-other'],
  'direction-other': ['information'],
  'direction-motorway': ['direction-primary', 'information'],
  'direction-primary': ['direction-motorway', 'information'],
  roadworks: ['warning', 'information'],
  'markings-across': ['markings-along', 'markings-other'],
  'markings-along': ['markings-across', 'markings-other'],
  'markings-edge': ['markings-other', 'markings-along'],
  'markings-other': ['markings-along', 'markings-edge'],
  'traffic-lights': ['motorway-signals'],
  'motorway-signals': ['traffic-lights', 'information'],
  police: ['arm-signals-control', 'officers'],
  'arm-signals': ['vehicle-signals', 'arm-signals-control'],
  'arm-signals-control': ['arm-signals', 'police'],
  'vehicle-signals': ['arm-signals'],
  'school-patrol': ['police'],
  'hazard-plates': ['vehicle-markings'],
  'vehicle-markings': ['hazard-plates'],
};

const SIGN_PROMPT = {
  'order-red': 'What does this sign mean?',
  'order-blue': 'What does this sign mean?',
  warning: 'What does this sign warn you of?',
  information: 'What does this sign mean?',
  roadworks: 'What does this sign mean?',
  'direction-other': 'What does this sign mean?',
  'markings-across': 'What does this road marking mean?',
  'markings-along': 'What does this road marking mean?',
  'markings-edge': 'What do these markings mean?',
  'markings-other': 'What does this road marking mean?',
  'traffic-lights': 'What does this traffic light signal mean?',
  'motorway-signals': 'What does this motorway signal mean?',
  police: 'What is this police officer signalling?',
  'arm-signals': 'What does this arm signal mean?',
  'arm-signals-control': 'What does this arm signal to a person controlling traffic mean?',
  'vehicle-signals': 'What is this signal telling you?',
  'school-patrol': 'What is this school crossing patrol signalling?',
  'hazard-plates': 'What does this hazard warning plate mean?',
  'vehicle-markings': 'What does this vehicle marking mean?',
};

const ID_GROUPS = new Set(['order-red', 'order-blue', 'warning', 'information', 'roadworks', 'markings-across', 'markings-along', 'motorway-signals', 'traffic-lights', 'hazard-plates']);

function signPool(signs, groups) {
  const pool = [];
  for (const g of groups) for (const s of signs.signs) if (s.quiz && s.group === g) pool.push(s);
  return pool;
}

function pickDistractors(sign, signs, r, n = 3) {
  const seen = new Set([sign.meaning.toLowerCase()]);
  const out = [];
  const groups = [sign.group, ...(GROUP_FALLBACK[sign.group] || [])];
  for (const g of groups) {
    for (const s of r.shuffle(signPool(signs, [g]))) {
      const key = s.meaning.toLowerCase();
      if (seen.has(key) || s.id === sign.id) continue;
      seen.add(key);
      out.push(s);
      if (out.length === n) return out;
    }
  }
  return out;
}

function shortMeaning(m) {
  // Long official captions make giveaway options; keep the main clause.
  let t = m.replace(/\s*\((?:note|some signs|each bar|the number)[^)]*\)/i, '');
  if (t.length > 110) t = t.split(/(?<=[.;])\s/)[0];
  return t;
}

export function signMeaningQuestion(sign, signs, seed) {
  const r = rng(seed);
  const ds = pickDistractors(sign, signs, r);
  if (ds.length < 3) return null;
  const options = [sign, ...ds].map((s) => ({ text: shortMeaning(s.meaning) }));
  return {
    id: `SIGN-M-${sign.id}`, topic: 'road-signs', gen: true,
    q: SIGN_PROMPT[sign.group] || 'What does this sign mean?',
    img: sign.img,
    options, answer: 0,
    explain: `This means: ${sign.meaning}.`,
    ref: [sign.rule ? `HC ${sign.rule}` : `HC ${sectionName(sign.section)}`],
  };
}

export function whichSignQuestion(sign, signs, seed) {
  const r = rng(seed);
  const ds = pickDistractors(sign, signs, r).filter((s) => s.group === sign.group || ID_GROUPS.has(s.group));
  if (ds.length < 3) return null;
  const kind = sign.group.startsWith('markings') ? 'road marking' : sign.group === 'traffic-lights' ? 'signal' : sign.group === 'hazard-plates' ? 'plate' : 'sign';
  return {
    id: `SIGN-W-${sign.id}`, topic: 'road-signs', gen: true,
    q: `Which ${kind} means '${shortMeaning(sign.meaning).replace(/\.$/, '')}'?`,
    options: [sign, ...ds].map((s) => ({ img: s.img, alt: s.meaning })), answer: 0,
    imageOptions: true,
    explain: `The correct ${kind} means: ${sign.meaning}.`,
    ref: [sign.rule ? `HC ${sign.rule}` : `HC ${sectionName(sign.section)}`],
  };
}

function sectionName(slug) {
  return {
    'traffic-signs': 'Traffic signs', 'road-markings': 'Road markings', 'light-signals-controlling-traffic': 'Light signals',
    'vehicle-markings': 'Vehicle markings', 'signals-by-authorised-persons': 'Signals by authorised persons',
    'signals-to-other-road-users': 'Signals to other road users',
  }[slug] || 'Traffic signs';
}

// ---- Pools and selection --------------------------------------------------------------------

let POOLS = null;

export function buildPools(bank, signs) {
  const byTopic = Object.fromEntries(TOPICS.map((t) => [t.id, []]));
  for (const q of bank.questions) if (byTopic[q.topic]) byTopic[q.topic].push({ kind: 'bank', id: q.id, q });
  for (const q of GENERATED) byTopic[q.topic].push({ kind: 'bank', id: q.id, q });
  for (const s of signs.signs) {
    if (!s.quiz) continue;
    byTopic['road-signs'].push({ kind: 'signM', id: `SIGN-M-${s.id}`, sign: s });
    if (ID_GROUPS.has(s.group)) byTopic['road-signs'].push({ kind: 'signW', id: `SIGN-W-${s.id}`, sign: s });
  }
  POOLS = { byTopic, bank, signs, all: Object.values(byTopic).flat() };
  return POOLS;
}

export const pools = () => POOLS;

export function topicCounts() {
  return Object.fromEntries(Object.entries(POOLS.byTopic).map(([k, v]) => [k, v.length]));
}

function weightFor(entry, stats) {
  const s = stats[entry.id];
  let w;
  if (!s) w = 6;                       // never seen: most likely
  else if (s.last === 0) w = 4;        // got it wrong last time
  else w = Math.max(0.4, 2 / s.n);     // answered correctly: less often the more you've seen it
  if (entry.kind === 'signW' || entry.kind === 'signM') w *= 0.8; // there are a lot of these
  return w;
}

function weightedSample(entries, n, r, stats, exclude) {
  const pool = entries.filter((e) => !exclude.has(e.id) && !exclude.has(groupKey(e)));
  const out = [];
  const ws = pool.map((e) => weightFor(e, stats));
  for (let k = 0; k < n && pool.length; k++) {
    const total = ws.reduce((a, b) => a + b, 0);
    let x = r() * total, i = 0;
    while (i < pool.length - 1 && x > ws[i]) { x -= ws[i]; i++; }
    const e = pool[i];
    out.push(e);
    exclude.add(e.id);
    exclude.add(groupKey(e));
    pool.splice(i, 1); ws.splice(i, 1);
  }
  return out;
}

// Avoid asking "what does sign X mean" and "which sign means X" in the same test.
function groupKey(e) {
  return e.sign ? `S:${e.sign.id}` : `Q:${e.id}`;
}

export function instantiate(entry, seed) {
  const r = rng(seed);
  let base;
  if (entry.kind === 'signM') base = signMeaningQuestion(entry.sign, POOLS.signs, seed);
  else if (entry.kind === 'signW') base = whichSignQuestion(entry.sign, POOLS.signs, seed);
  else {
    const q = entry.q;
    base = {
      ...q,
      img: q.sign ? signImg(q.sign) : q.img || null,
      options: q.options.map((o) => (typeof o === 'string' ? { text: o } : o)),
    };
  }
  if (!base) return null;
  const order = r.shuffle([0, 1, 2, 3].slice(0, base.options.length));
  return {
    id: base.id,
    topic: base.topic,
    q: base.q,
    img: base.img || null,
    imageOptions: !!base.imageOptions,
    options: order.map((i) => base.options[i]),
    correct: order.indexOf(base.answer),
    explain: base.explain,
    ref: base.ref || [],
    seed,
  };
}

function signImg(id) {
  const s = POOLS.signs.signs.find((x) => x.id === id);
  return s ? s.img : null;
}

// Rebuild a question exactly as it was shown (for reviewing a finished test).
export function rebuild(id, seed) {
  const entry = POOLS.all.find((e) => e.id === id);
  return entry ? instantiate(entry, seed) : null;
}

export function mockTest(seed, { videoCount = 0 } = {}) {
  const r = rng(seed);
  const stats = store.qstats();
  const exclude = new Set();
  const target = MOCK.questions - videoCount;
  // Start from the topic blueprint, then nudge one or two questions between topics so tests vary.
  const plan = Object.fromEntries(TOPICS.map((t) => [t.id, t.mock]));
  let sum = Object.values(plan).reduce((a, b) => a + b, 0);
  for (let k = 0; k < 2; k++) {
    const from = r.pick(TOPICS.filter((t) => plan[t.id] > 1)).id;
    const to = r.pick(TOPICS).id;
    plan[from]--; plan[to]++;
  }
  while (sum < target) { plan[r.pick(TOPICS).id]++; sum++; }
  while (sum > target) { const t = r.pick(TOPICS.filter((x) => plan[x.id] > 0)).id; plan[t]--; sum--; }
  const picks = [];
  for (const t of TOPICS) {
    const entries = POOLS.byTopic[t.id];
    picks.push(...weightedSample(entries, Math.min(plan[t.id], entries.length), r, stats, exclude));
  }
  // Top up from any topic if a topic was short.
  if (picks.length < target) picks.push(...weightedSample(POOLS.all, target - picks.length, r, stats, exclude));
  const qs = r.shuffle(picks).map((e, i) => instantiate(e, (seed + i * 7919) >>> 0)).filter(Boolean);
  return qs;
}

export function practiceSet(seed, { topics, count, mode }) {
  const r = rng(seed);
  const stats = store.qstats();
  let entries = topics.flatMap((t) => POOLS.byTopic[t] || []);
  if (mode === 'wrong') entries = entries.filter((e) => stats[e.id] && stats[e.id].last === 0);
  if (mode === 'unseen') entries = entries.filter((e) => !stats[e.id]);
  const picks = weightedSample(entries, Math.min(count, entries.length), r, stats, new Set());
  return picks.map((e, i) => instantiate(e, (seed + i * 104729) >>> 0)).filter(Boolean);
}

export function countWrong() {
  const stats = store.qstats();
  return Object.values(stats).filter((s) => s.last === 0).length;
}

export function shuffleTopics() {
  return shuffle(TOPICS);
}
