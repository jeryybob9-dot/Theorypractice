// Entry point: loads data, routes between screens.
import { h, icon, fmtDate, fmtTime, pct, clear } from './util.js';
import { page, app, errorBox, confirmDialog } from './ui.js';
import { store } from './store.js';
import { TOPICS, topicById, loadBank, loadSigns, MOCK, HPT } from './data.js';
import { buildPools, topicCounts, countWrong } from './questions.js';
import { renderTest, leaveTest, startMock, startPractice, renderResults, activeTest } from './mcq.js';
import { renderLearn, renderHCIndex, renderHCSection, renderSigns, ATTRIB } from './hc.js';

let ready = false;
let leaveHook = null;

function applyTheme() {
  const t = store.settings().theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

async function boot() {
  applyTheme();
  try {
    const [bank, signs] = await Promise.all([loadBank(), loadSigns()]);
    buildPools(bank, signs);
    ready = true;
  } catch (e) {
    clear(app()).appendChild(h('div', { class: 'content' }, errorBox(e), h('p', null, 'Check your connection and reload.')));
    return;
  }
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

async function route() {
  if (!ready) return;
  if (leaveHook) { try { leaveHook(); } catch (e) { /* ignore */ } leaveHook = null; }
  leaveTest();
  const hash = location.hash || '#/';
  const parts = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const [p0, p1, p2] = parts;
  try {
    switch (p0) {
      case '': return renderHome();
      case 'tests': return renderTests();
      case 'mock': return renderMockIntro();
      case 'full': return renderMockIntro(true);
      case 'test': return renderTest();
      case 'practice': return renderPractice();
      case 'results': return renderResults(p1, { page });
      case 'hazard': {
        const hpt = await import('./hpt/ui.js');
        leaveHook = hpt.leave;
        return hpt.route(p1, p2);
      }
      case 'learn': return renderLearn();
      case 'hc': return p1 ? renderHCSection(p1, p2) : renderHCIndex();
      case 'signs': return renderSigns(p1 || 'all');
      case 'progress': return renderProgress();
      case 'settings': return renderSettings();
      case 'about': return renderAbout();
      default: location.hash = '#/';
    }
  } catch (e) {
    console.error(e);
    page({ title: 'Error', back: '#/' }).appendChild(errorBox(e));
  }
}

// ---------------------------------------------------------------------------------------------

function readiness() {
  const tests = store.tests().filter((t) => t.type !== 'practice').slice(0, 5);
  const hpts = store.hpt().filter((t) => t.full).slice(0, 5);
  const avgM = tests.length ? tests.reduce((a, t) => a + t.score, 0) / tests.length : null;
  const avgH = hpts.length ? hpts.reduce((a, t) => a + t.total, 0) / hpts.length : null;
  return { tests, hpts, avgM, avgH };
}

function renderHome() {
  const main = page({ title: 'Theory Practice', actions: h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Settings', html: icon('gear') }) });
  const r = readiness();
  const st = store.qstats();
  const seen = Object.keys(st).length;
  const resume = activeTest();
  main.appendChild(h('div', { class: 'card hero' },
    h('h2', null, 'UK car theory test'),
    h('p', null, `Two parts: ${MOCK.questions} multiple-choice questions in ${MOCK.minutes} minutes (pass ${MOCK.pass}), then ${HPT.clips} hazard perception clips (pass ${HPT.pass}/${HPT.max}). You must pass both.`),
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat' }, h('b', null, r.avgM == null ? '–' : `${Math.round(r.avgM)}/50`), h('span', null, 'Mock average')),
      h('div', { class: 'stat' }, h('b', null, r.avgH == null ? '–' : `${Math.round(r.avgH)}/75`), h('span', null, 'Hazard average')),
      h('div', { class: 'stat' }, h('b', null, String(seen)), h('span', null, 'Questions seen')))));
  if (resume) {
    main.appendChild(h('div', { class: 'card', style: { marginTop: '12px' } },
      h('h3', null, resume.type === 'practice' ? 'Practice in progress' : 'Mock test in progress'),
      h('p', { class: 'muted small' }, `Question ${resume.current + 1} of ${resume.questions.length}`, resume.timeLimit ? ` · ${fmtTime(resume.timeLimit - resume.elapsed)} left` : ''),
      h('a', { class: 'btn block', href: '#/test' }, 'Resume')));
  }
  main.appendChild(h('div', { class: 'section-title' }, 'Take a test'));
  main.appendChild(h('div', { class: 'grid-2' },
    tile('#/full', 'Full theory test', '50 questions, a 3-minute break, then 14 hazard clips', '#0b2e4f', 'test'),
    tile('#/mock', 'Mock test', '50 questions in 57 minutes, marked like the real test', '#1d70b8', 'test'),
    tile('#/hazard', 'Hazard perception', '14 clips with 15 developing hazards, out of 75', '#d4351c', 'hazard'),
    tile('#/practice', 'Practise by topic', 'Instant feedback with the Highway Code rule', '#00703c', 'check')));
  const wrong = countWrong();
  main.appendChild(h('div', { class: 'section-title' }, 'Revise'));
  main.appendChild(h('div', { class: 'list' },
    wrong ? h('button', { class: 'list-row', onclick: () => startPractice({ topics: TOPICS.map((t) => t.id), count: Math.min(25, wrong), mode: 'wrong', title: 'Questions you got wrong' }) },
      h('div', { class: 'grow' }, h('div', null, 'Questions you got wrong'), h('div', { class: 'sub' }, `${wrong} to retry`)), h('span', { class: 'chev', html: icon('chev') })) : null,
    h('a', { class: 'list-row', href: '#/signs' }, h('div', { class: 'grow' }, h('div', null, 'Traffic signs'), h('div', { class: 'sub' }, 'The official sign images from the Highway Code')), h('span', { class: 'chev', html: icon('chev') })),
    h('a', { class: 'list-row', href: '#/hc' }, h('div', { class: 'grow' }, h('div', null, 'The Highway Code'), h('div', { class: 'sub' }, 'Every rule, searchable and works offline')), h('span', { class: 'chev', html: icon('chev') }))));
  if (!isStandalone()) {
    main.appendChild(h('div', { class: 'notice info', style: { marginTop: '16px' } },
      h('b', null, 'Install on your iPhone: '), 'in Safari, tap the Share button, then ', h('b', null, 'Add to Home Screen'), '. It then opens full screen and works offline.'));
  }
}

function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

function tile(href, title, sub, color, ico) {
  return h('a', { class: 'tile', href },
    h('div', { class: 'tile-ico', style: { background: color }, html: icon(ico) }),
    h('h3', null, title), h('p', null, sub));
}

function renderTests() {
  const main = page({ title: 'Tests' });
  main.appendChild(h('div', { class: 'grid-2' },
    tile('#/mock', 'Mock test', '50 questions · 57 minutes · pass 43', '#1d70b8', 'test'),
    tile('#/practice', 'Practise by topic', 'Choose topics, see answers as you go', '#00703c', 'check'),
    tile('#/full', 'Full theory test', 'Both parts, like the test centre', '#0b2e4f', 'test'),
    tile('#/hazard', 'Hazard perception', '14 clips · pass 44 of 75', '#d4351c', 'hazard')));
  const tests = store.tests();
  main.appendChild(h('div', { class: 'section-title' }, 'History'));
  if (!tests.length) { main.appendChild(h('p', { class: 'muted' }, 'Your test results will appear here.')); return; }
  main.appendChild(h('div', { class: 'list' }, tests.slice(0, 50).map((t) =>
    h(t.items ? 'a' : 'div', { class: 'list-row', href: t.items ? `#/results/${t.id}` : null },
      h('div', { class: 'grow' },
        h('div', null, t.type === 'practice' ? t.title : t.type === 'full' ? 'Full test (questions)' : 'Mock test'),
        h('div', { class: 'sub' }, fmtDate(t.ts), ' · ', fmtTime(t.duration))),
      h('b', null, `${t.score}/${t.total}`),
      t.pass != null ? h('span', { class: `pill ${t.pass ? 'pass' : 'fail'}` }, t.pass ? 'Pass' : 'Fail') : null))));
}

function renderMockIntro(full = false) {
  const main = page({ title: full ? 'Full theory test' : 'Mock test', back: '#/tests' });
  const s = store.settings();
  main.appendChild(h('div', { class: 'card' },
    h('h2', null, full ? 'Part 1: multiple-choice questions' : 'Multiple-choice mock test'),
    h('ul', null,
      h('li', null, `${MOCK.questions} questions. You have ${s.extraTime ? `${Math.round(MOCK.minutes * 1.25)} minutes (extra time is on)` : `${MOCK.minutes} minutes`}.`),
      h('li', null, `The pass mark is ${MOCK.pass} out of ${MOCK.questions}.`),
      h('li', null, 'Questions come from all 14 DVSA topics. The last 3 are about a short video clip, which you can watch as many times as you like.'),
      h('li', null, 'Select one answer per question. Flag questions to come back to, and use Review to check before you end the test.'),
      h('li', null, "You won't see whether you're right until the end, as in the real test.")),
    full ? h('div', { class: 'notice info' }, `After the questions you can have a break of up to 3 minutes, then the hazard perception part: ${HPT.clips} clips, pass mark ${HPT.pass} out of ${HPT.max}.`) : null,
    h('div', { style: { height: '12px' } }),
    h('button', { class: 'btn block', onclick: async (e) => { e.target.disabled = true; e.target.textContent = 'Preparing…'; await startMock({ full }); } }, 'Start test')));
  main.appendChild(h('p', { class: 'small muted', style: { marginTop: '12px' } },
    'Every mock is drawn fresh from the whole question bank, so you can take as many as you like. Questions you have not seen yet, or got wrong, come up more often.'));
}

function renderPractice() {
  const main = page({ title: 'Practise by topic', back: '#/tests' });
  const counts = topicCounts();
  const stats = store.qstats();
  const sel = new Set(TOPICS.map((t) => t.id));
  let count = 10;
  let mode = 'mixed';
  const chips = h('div', { class: 'list' });
  const renderChips = () => {
    clear(chips);
    for (const t of TOPICS) {
      let seen = 0, right = 0;
      for (const [id, s] of Object.entries(stats)) {
        if (topicOf(id) === t.id) { seen++; if (s.last) right++; }
      }
      const row = h('label', { class: 'toggle-row' },
        h('div', { class: 'grow' }, h('div', null, t.name), h('div', { class: 'sub small muted' }, `${counts[t.id] || 0} questions`, seen ? ` · ${pct(right, seen)}% right last time` : '')),
        h('span', { class: 'switch' }, h('input', { type: 'checkbox', checked: sel.has(t.id), onchange: (e) => { e.target.checked ? sel.add(t.id) : sel.delete(t.id); } }), h('span')));
      chips.appendChild(row);
    }
  };
  renderChips();
  const seg = (opts, get, set) => {
    const el = h('div', { class: 'seg' });
    const draw = () => {
      clear(el);
      for (const [v, label] of opts) el.appendChild(h('button', { 'aria-pressed': get() === v ? 'true' : 'false', onclick: () => { set(v); draw(); } }, label));
    };
    draw();
    return el;
  };
  main.appendChild(h('div', { class: 'section-title' }, 'Number of questions'));
  main.appendChild(seg([[10, '10'], [20, '20'], [30, '30'], [50, '50']], () => count, (v) => (count = v)));
  main.appendChild(h('div', { class: 'section-title' }, 'Which questions'));
  main.appendChild(seg([['mixed', 'Mixed'], ['unseen', 'Not seen'], ['wrong', 'Got wrong']], () => mode, (v) => (mode = v)));
  main.appendChild(h('div', { class: 'section-title' }, 'Topics'));
  main.appendChild(h('div', { class: 'row', style: { marginBottom: '8px' } },
    h('button', { class: 'btn ghost', onclick: () => { TOPICS.forEach((t) => sel.add(t.id)); renderChips(); } }, 'Select all'),
    h('button', { class: 'btn ghost', onclick: () => { sel.clear(); renderChips(); } }, 'Clear')));
  main.appendChild(chips);
  const msg = h('p', { class: 'muted small' });
  main.appendChild(h('div', { style: { height: '14px' } }));
  main.appendChild(h('button', { class: 'btn block', onclick: () => {
    if (!sel.size) { msg.textContent = 'Choose at least one topic.'; return; }
    const ok = startPractice({ topics: [...sel], count, mode, title: sel.size === 1 ? topicById[[...sel][0]].name : 'Practice' });
    if (!ok) msg.textContent = mode === 'wrong' ? "You haven't got any of these wrong yet." : "You've seen every question in these topics. Choose Mixed instead.";
  } }, 'Start practice'));
  main.appendChild(msg);
}

function topicOf(id) {
  const pre = id.slice(0, 4);
  const map = { 'ALE-': 'alertness', 'ATT-': 'attitude', 'SAF-': 'safety-vehicle', 'MAR-': 'safety-margins', 'HAZ-': 'hazard-awareness', 'VUL-': 'vulnerable-road-users', 'OTH-': 'other-vehicles', 'HAN-': 'vehicle-handling', 'MOT-': 'motorway-rules', 'RUL-': 'rules-of-the-road', 'SIG-': 'road-signs', 'DOC-': 'documents', 'INC-': 'incidents', 'LOA-': 'vehicle-loading' };
  if (map[pre]) return map[pre];
  if (id.startsWith('SIGN-')) return 'road-signs';
  if (id.startsWith('GEN-SD')) return 'safety-margins';
  if (id.startsWith('GEN-SL')) return 'rules-of-the-road';
  return null;
}

function renderProgress() {
  const main = page({ title: 'Progress', actions: h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Settings', html: icon('gear') }) });
  const r = readiness();
  const stats = store.qstats();
  const counts = topicCounts();
  const totalQ = Object.values(counts).reduce((a, b) => a + b, 0);
  const seen = Object.keys(stats).length;
  const mockPassRate = r.tests.length ? pct(r.tests.filter((t) => t.pass).length, r.tests.length) : null;
  const hptPassRate = r.hpts.length ? pct(r.hpts.filter((t) => t.pass).length, r.hpts.length) : null;
  let verdict = 'Take a few mock tests and hazard perception tests to see how ready you are.';
  if (r.tests.length >= 3 && r.hpts.length >= 2) {
    const goodM = r.avgM >= 46, goodH = r.avgH >= 50;
    verdict = goodM && goodH ? "You're consistently scoring above the pass marks in both parts. You look ready to book."
      : !goodM && !goodH ? 'Keep practising both parts. Aim for 46+ in the questions and 50+ in hazard perception to leave a margin.'
      : !goodM ? 'Your hazard perception is strong. Work on your weakest topics until you average 46+ in mock tests.'
      : 'Your multiple-choice scores are strong. Keep practising hazard clips until you average 50+.';
  }
  main.appendChild(h('div', { class: 'card' },
    h('h2', null, 'Test readiness'),
    h('p', { class: 'muted' }, verdict),
    h('div', { class: 'grid-2' },
      h('div', null, h('div', { class: 'small muted' }, 'Mock tests (last 5)'), h('div', { style: { fontSize: '1.4rem', fontWeight: 800 } }, r.avgM == null ? '–' : `${r.avgM.toFixed(1)}/50`), h('div', { class: 'small muted' }, mockPassRate == null ? '' : `${mockPassRate}% passed`)),
      h('div', null, h('div', { class: 'small muted' }, 'Hazard tests (last 5)'), h('div', { style: { fontSize: '1.4rem', fontWeight: 800 } }, r.avgH == null ? '–' : `${r.avgH.toFixed(1)}/75`), h('div', { class: 'small muted' }, hptPassRate == null ? '' : `${hptPassRate}% passed`)))));
  const topicCard = h('div', { class: 'card' }, h('h2', null, 'Topics'), h('p', { class: 'small muted' }, `You've seen ${seen} of ${totalQ} questions. Bars show the share you got right the last time you answered them.`));
  for (const t of TOPICS) {
    let n = 0, right = 0;
    for (const [id, s] of Object.entries(stats)) if (topicOf(id) === t.id) { n++; if (s.last) right++; }
    const p = n ? right / n : 0;
    topicCard.appendChild(h('div', { class: 'topic-row' },
      h('div', { class: 'row' }, h('span', null, t.name), h('span', { class: 'small muted' }, n ? `${pct(right, n)}% · ${n}/${counts[t.id]} seen` : `0/${counts[t.id]} seen`)),
      h('div', { class: `bar ${p >= 0.86 ? 'good' : p >= 0.6 ? 'warn' : 'bad'}` }, h('i', { style: { width: `${100 * p}%` } }))));
  }
  main.appendChild(topicCard);
  const hist = store.hpt();
  if (hist.length) {
    main.appendChild(h('div', { class: 'section-title' }, 'Hazard perception history'));
    main.appendChild(h('div', { class: 'list' }, hist.slice(0, 20).map((t) =>
      h('a', { class: 'list-row', href: `#/hazard/results/${t.id}` },
        h('div', { class: 'grow' }, h('div', null, t.full ? 'Hazard perception test' : 'Practice clips'), h('div', { class: 'sub' }, fmtDate(t.ts))),
        h('b', null, `${t.total}/${t.max}`),
        t.full ? h('span', { class: `pill ${t.pass ? 'pass' : 'fail'}` }, t.pass ? 'Pass' : 'Fail') : null))));
  }
}

function renderSettings() {
  const main = page({ title: 'Settings', back: '#/progress' });
  const s = store.settings();
  const set = (k, v) => { s[k] = v; store.saveSettings(s); if (k === 'theme') applyTheme(); };
  const sw = (k, label, sub) => h('label', { class: 'toggle-row' },
    h('div', null, h('div', null, label), sub ? h('div', { class: 'small muted' }, sub) : null),
    h('span', { class: 'switch' }, h('input', { type: 'checkbox', checked: !!s[k], onchange: (e) => set(k, e.target.checked) }), h('span')));
  main.appendChild(h('div', { class: 'list' },
    sw('practiceFeedback', 'Show answers during practice', 'Mock tests always wait until the end'),
    sw('voiceover', 'Voiceover', 'Adds a button to read each question aloud'),
    sw('extraTime', 'Extra time on mock tests', 'For candidates DVSA has approved extra time'),
    sw('hptCountdown', 'Countdown before each hazard clip')));
  main.appendChild(h('div', { class: 'section-title' }, 'Appearance'));
  const seg = h('div', { class: 'seg' });
  const draw = () => {
    clear(seg);
    for (const [v, l] of [['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']]) seg.appendChild(h('button', { 'aria-pressed': s.theme === v ? 'true' : 'false', onclick: () => { set('theme', v); draw(); } }, l));
  };
  draw();
  main.appendChild(seg);
  main.appendChild(h('div', { class: 'section-title' }, 'Hazard clip quality'));
  const q = h('div', { class: 'seg' });
  const drawQ = () => {
    clear(q);
    for (const [v, l] of [['auto', 'Automatic'], ['low', 'Battery saver'], ['high', 'High']]) q.appendChild(h('button', { 'aria-pressed': s.quality === v ? 'true' : 'false', onclick: () => { set('quality', v); drawQ(); } }, l));
  };
  drawQ();
  main.appendChild(q);
  main.appendChild(h('div', { class: 'section-title' }, 'Data'));
  main.appendChild(h('div', { class: 'list' },
    h('a', { class: 'list-row', href: '#/about' }, h('div', { class: 'grow' }, 'About and sources'), h('span', { class: 'chev', html: icon('chev') })),
    h('button', { class: 'list-row', style: { color: 'var(--bad)' }, onclick: async () => {
      if (await confirmDialog({ title: 'Reset all progress?', text: 'This deletes your test history and question statistics on this device.', ok: 'Reset', danger: true })) { store.resetAll(); location.hash = '#/'; }
    } }, h('div', { class: 'grow' }, 'Reset all progress'))));
}

function renderAbout() {
  const main = page({ title: 'About', back: '#/settings' });
  main.appendChild(h('div', { class: 'card stack' },
    h('h2', null, 'Where the content comes from'),
    h('p', null, 'All rules, facts, sign images and test formats in this app come from official sources:'),
    h('ul', null,
      h('li', null, h('a', { href: 'https://www.gov.uk/guidance/the-highway-code', target: '_blank', rel: 'noopener' }, 'The Highway Code'), ' (GOV.UK), including all the sign, marking and signal images.'),
      h('li', null, 'DVSA guidance on GOV.UK: ', h('a', { href: 'https://www.gov.uk/theory-test', target: '_blank', rel: 'noopener' }, 'the theory test'), ', MOT, licences, penalties, insurance, tax, towing, eyesight and more.')),
    h('p', null, "The questions are written for this app in the DVSA's style, and each one links to the Highway Code rule or GOV.UK page it comes from. They are not the DVSA's licensed revision questions, and the real test questions are confidential."),
    h('p', null, "The hazard perception clips are generated on your phone in 3D. They follow the DVSA format (14 clips, one with two developing hazards, 5 to 0 points per hazard, no score if you click continuously or in a pattern) but they aren't the DVSA's CGI clips."),
    h('p', { class: 'small muted' }, ATTRIB, ' Contains public sector information licensed under the ', h('a', { href: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/', target: '_blank', rel: 'noopener' }, 'Open Government Licence v3.0'), '.')));
}

boot();
