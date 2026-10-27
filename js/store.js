// Persistence in localStorage, with an in-memory fallback (private browsing, storage full or blocked).

const PREFIX = 'tp1.';
const memory = new Map();

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw != null) return JSON.parse(raw);
  } catch (e) { /* fall through */ }
  return memory.has(key) ? memory.get(key) : fallback;
}

function write(key, value) {
  memory.set(key, value);
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* keep in memory only */ }
}

function remove(key) {
  memory.delete(key);
  try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
}

const DEFAULT_SETTINGS = {
  theme: 'auto',          // auto | light | dark
  voiceover: false,       // read questions aloud (the real test offers an English voiceover)
  practiceFeedback: true, // show the answer straight away in practice mode
  hptCountdown: true,     // short countdown before each hazard clip
  extraTime: false,       // 25% extra time on the mock test (as for candidates with reading difficulties)
  quality: 'auto',        // hazard clip render quality: auto | low | high
};

export const store = {
  settings() { return { ...DEFAULT_SETTINGS, ...read('settings', {}) }; },
  saveSettings(s) { write('settings', s); },

  qstats() { return read('qstats', {}); },
  recordAnswers(list) {
    // list: [{ id, correct: bool }]
    const st = read('qstats', {});
    const now = Date.now();
    for (const { id, correct } of list) {
      const s = st[id] || { n: 0, c: 0, last: 0, ts: 0 };
      s.n += 1;
      if (correct) s.c += 1;
      s.last = correct ? 1 : 0;
      s.ts = now;
      st[id] = s;
    }
    write('qstats', st);
  },

  tests() { return read('tests', []); },
  addTest(t) {
    const all = read('tests', []);
    all.unshift(t);
    // Keep full answer detail for the latest 40 tests, summaries for up to 300.
    all.forEach((x, i) => { if (i >= 40 && x.items) delete x.items; });
    write('tests', all.slice(0, 300));
  },
  getTest(id) { return read('tests', []).find((t) => t.id === id); },

  hpt() { return read('hpt', []); },
  addHpt(r) {
    const all = read('hpt', []);
    all.unshift(r);
    write('hpt', all.slice(0, 200));
  },
  getHpt(id) { return read('hpt', []).find((t) => t.id === id); },

  active() { return read('active', null); },
  saveActive(state) { write('active', state); },
  clearActive() { remove('active'); },

  resetAll() {
    for (const k of ['qstats', 'tests', 'hpt', 'active']) remove(k);
  },
};
