// Hazard perception screens: intro, the 14-clip test, single-clip practice, results and clip review.
import { h, icon, clear, newSeed, fmtDate, fmtTime } from '../util.js';
import { page, app, confirmDialog, errorBox } from '../ui.js';
import { store } from '../store.js';
import { HPT, MOCK } from '../data.js';
import { makeClip, makeTestPlan, TEMPLATE_NAMES } from './scenarios.js';
import { scoreClip, BAND_COLOURS } from './scoring.js';

let player = null;
let cleanup = [];

export function leave() {
  for (const f of cleanup) { try { f(); } catch (e) { /* ignore */ } }
  cleanup = [];
  if (player) { player.dispose(); player = null; }
  document.body.style.overflow = '';
}

async function getPlayer(frame, opts) {
  const { ClipPlayer } = await import('./player.js');
  if (player) player.dispose();
  player = new ClipPlayer(frame, opts);
  return player;
}

export function route(p1, p2) {
  if (!p1) return renderHome();
  if (p1 === 'test') return runTest({});
  if (p1 === 'practice') return renderPracticeMenu();
  if (p1 === 'clip') return runPractice(p2 || null);
  if (p1 === 'results') return renderResults(p2);
  if (p1 === 'review') { const [id, i] = (p2 || '').split('~'); return renderReview(id, +i); }
  if (p1 === 'full') return renderBreak(p2);
  if (p1 === 'final') { const [mid, hid] = (p2 || '').split('~'); return renderFinal(mid, hid); }
  location.hash = '#/hazard';
}

const LABELS = {
  pedestrianStepsOut: 'Pedestrian stepping out', ballChild: 'Ball and child', emergingCar: 'Car emerging from a junction',
  parkedCarPullsOut: 'Parked car pulling out', busPullsOut: 'Bus leaving a stop', carAheadTurns: 'Vehicle ahead turning right',
  cyclistMovesOut: 'Cyclist moving out', oncomingOvertaker: 'Oncoming overtaker', zebra: 'Zebra crossing', horses: 'Horse riders',
  tractorOut: 'Tractor from a field', deer: 'Deer on a country road', queue: 'Queuing traffic', laneCutIn: 'Vehicle cutting in',
  reversing: 'Car reversing from a drive', iceCream: 'Ice-cream van', doorOpens: 'Car door opening', dog: 'Dog in the road',
  schoolPatrol: 'School crossing patrol', oncomingTurnsAcross: 'Car turning across your path',
};

function renderHome() {
  const main = page({ title: 'Hazard perception' });
  const hist = store.hpt();
  const full = hist.filter((x) => x.full);
  main.appendChild(h('div', { class: 'card hero' },
    h('h2', null, 'Hazard perception test'),
    h('p', null, `${HPT.clips} clips of everyday road scenes. Each has at least one developing hazard, and one clip has two: ${HPT.hazards} hazards, up to 5 points each. The pass mark is ${HPT.pass} out of ${HPT.max}.`),
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat' }, h('b', null, full.length ? `${full[0].total}/75` : '–'), h('span', null, 'Last test')),
      h('div', { class: 'stat' }, h('b', null, full.length ? `${Math.max(...full.map((x) => x.total))}/75` : '–'), h('span', null, 'Best')),
      h('div', { class: 'stat' }, h('b', null, String(full.length)), h('span', null, 'Tests taken')))));
  main.appendChild(h('div', { style: { height: '12px' } }));
  main.appendChild(h('div', { class: 'grid-2' },
    h('a', { class: 'tile', href: '#/hazard/test' }, h('div', { class: 'tile-ico', style: { background: '#d4351c' }, html: icon('hazard') }), h('h3', null, 'Full hazard test'), h('p', null, '14 clips, scored like the real test')),
    h('a', { class: 'tile', href: '#/hazard/practice' }, h('div', { class: 'tile-ico', style: { background: '#00703c' }, html: icon('play') }), h('h3', null, 'Practise a clip'), h('p', null, 'One clip, then see the scoring window'))));
  main.appendChild(h('div', { class: 'section-title' }, 'How scoring works'));
  main.appendChild(h('div', { class: 'card stack small' },
    h('p', null, h('b', null, 'Tap the screen'), ' as soon as you see a hazard ', h('i', null, 'starting to develop'), ': something that would make you change speed or direction. A red flag appears at the bottom each time you tap.'),
    h('p', null, 'Each developing hazard has a scoring window split into five parts. Tapping in the first part scores 5, then 4, 3, 2 and 1. Tapping before the window opens or after it closes scores nothing, but you don\'t lose points.'),
    h('div', { class: 'score-bands' }, [5, 4, 3, 2, 1].map((s, i) => h('span', { style: { background: BAND_COLOURS[i] } }, String(s)))),
    h('p', null, 'If you tap continuously or in a pattern, you score 0 for that clip, as in the real test. Tapping once or twice when you see a hazard developing is fine.'),
    h('p', { class: 'muted' }, 'As in the real test, clips can\'t be paused and you only see your scores at the end. Turn your phone sideways for the biggest picture.')));
  if (hist.length) {
    main.appendChild(h('div', { class: 'section-title' }, 'History'));
    main.appendChild(h('div', { class: 'list' }, hist.slice(0, 30).map((x) =>
      h('a', { class: 'list-row', href: `#/hazard/results/${x.id}` },
        h('div', { class: 'grow' }, h('div', null, x.full ? 'Hazard perception test' : (x.clips[0] && LABELS[x.clips[0].template[0]]) || 'Practice clip'), h('div', { class: 'sub' }, fmtDate(x.ts))),
        h('b', null, `${x.total}/${x.max}`),
        x.full ? h('span', { class: `pill ${x.pass ? 'pass' : 'fail'}` }, x.pass ? 'Pass' : 'Fail') : null))));
  }
}

function renderPracticeMenu() {
  const main = page({ title: 'Practise a clip', back: '#/hazard' });
  main.appendChild(h('a', { class: 'btn block', href: '#/hazard/clip' }, 'Random clip'));
  main.appendChild(h('div', { class: 'section-title' }, 'Or choose a type of hazard'));
  main.appendChild(h('div', { class: 'list' }, TEMPLATE_NAMES.map((n) =>
    h('a', { class: 'list-row', href: `#/hazard/clip/${n}` }, h('div', { class: 'grow' }, LABELS[n] || n), h('span', { class: 'chev', html: icon('chev') })))));
}

// ---- The player overlay --------------------------------------------------------------------

function overlayShell({ onClose, closeLabel = 'End test' }) {
  document.body.style.overflow = 'hidden';
  const root = clear(app());
  const frame = h('div', { class: 'hpt-frame' });
  const overlay = h('div', { class: 'hpt-overlay' });
  const hud = h('div', { class: 'hpt-hud' });
  frame.appendChild(hud);
  frame.appendChild(overlay);
  const stage = h('div', { class: 'hpt-stage' }, frame);
  const flags = h('div', { class: 'hpt-flags' }, h('div', { class: 'track' }));
  const close = h('button', { class: 'hpt-close', onclick: onClose }, closeLabel);
  const rotate = h('div', { class: 'hpt-rotate' }, 'Turn your phone sideways for a bigger picture.');
  const el = h('div', { class: 'hpt', role: 'application', 'aria-label': 'Hazard perception clip' }, stage, flags, close, rotate);
  root.appendChild(el);
  return { el, frame, overlay, hud, flags, stage, close };
}

function showOverlay(ov, ...content) {
  clear(ov);
  ov.style.display = '';
  for (const c of content) if (c) ov.appendChild(c);
}

function hideOverlay(ov) { ov.style.display = 'none'; clear(ov); }

function addFlag(flags, t, dur) {
  const f = h('div', { class: 'flag', html: `<svg viewBox="0 0 18 26" width="18" height="26"><path d="M2 26V2" stroke="#fff" stroke-width="2"/><path d="M3 2h13l-3 5 3 5H3z" fill="#d4351c"/></svg>` });
  f.style.left = `calc(12px + (100% - 24px) * ${t / dur})`;
  flags.appendChild(f);
}

function pulse(frame, x, y) {
  const r = frame.getBoundingClientRect();
  const p = h('div', { class: 'click-pulse' });
  p.style.left = `${x - r.left}px`;
  p.style.top = `${y - r.top}px`;
  frame.appendChild(p);
  setTimeout(() => p.remove(), 600);
}

const wait = (ms) => new Promise((res) => { const t = setTimeout(res, ms); cleanup.push(() => clearTimeout(t)); });

async function countdown(ov, title, sub) {
  const n = store.settings().hptCountdown ? 3 : 0;
  for (let i = n; i > 0; i--) {
    showOverlay(ov, h('h2', null, title), sub ? h('p', null, sub) : null, h('div', { class: 'count' }, String(i)));
    await wait(900);
  }
}

// ---- Full test ---------------------------------------------------------------------------

async function runTest({ mcqId = null }) {
  const seed = newSeed();
  const plan = makeTestPlan(seed, HPT.clips);
  let aborted = false;
  const shell = overlayShell({ onClose: async () => {
    if (player) player.pause();
    const ok = await confirmDialog({ title: 'End the hazard perception test?', text: "Your answers so far won't be saved.", ok: 'End test', cancel: 'Carry on', danger: true });
    if (ok) { aborted = true; leave(); location.hash = mcqId ? `#/results/${mcqId}` : '#/hazard'; } else if (player && player.world && shell.started) player.play();
  } });
  const results = [];
  try {
    await getPlayer(shell.frame, { mode: 'test' });
  } catch (e) {
    showOverlay(shell.overlay, errorBox(e));
    return;
  }
  // intro (the real test starts with a short explanation video)
  await new Promise((res) => showOverlay(shell.overlay,
    h('h2', null, 'Hazard perception'),
    h('p', null, `You'll see ${HPT.clips} clips. Tap the screen as soon as you see a hazard starting to develop. Each clip has at least one developing hazard; one clip has two.`),
    h('p', null, "You can't pause or replay clips during the test, and you'll get your score at the end. Tapping continuously or in a pattern scores zero for that clip."),
    h('button', { class: 'btn', onclick: res }, 'Start')));
  shell.started = true;
  for (let i = 0; i < plan.length && !aborted; i++) {
    const item = plan[i];
    showOverlay(shell.overlay, h('h2', null, `Clip ${i + 1} of ${plan.length}`), h('p', null, 'Loading…'));
    clear(shell.flags).appendChild(h('div', { class: 'track' }));
    const clip = makeClip(item.seed, { template: item.template, env: item.env, double: item.double });
    await player.load(clip);
    if (aborted) return;
    await countdown(shell.overlay, `Clip ${i + 1} of ${plan.length}`, 'Tap when you see a developing hazard');
    if (aborted) return;
    hideOverlay(shell.overlay);
    const clicks = await playClip(shell, clip);
    if (aborted) return;
    const sc = scoreClip(clip.hazards, clicks);
    results.push({ seed: item.seed, template: clip.template, env: item.env, double: item.double, time: clip.time, weather: clip.weather, hazards: clip.hazards, clicks, scores: sc.scores, raw: sc.rawScores, pattern: sc.pattern });
    if (sc.pattern) {
      showOverlay(shell.overlay, h('h2', null, 'Unacceptable response'), h('p', null, `${sc.pattern} You'll score zero for this clip.`));
      await wait(3200);
    } else {
      showOverlay(shell.overlay, h('h2', null, i + 1 < plan.length ? 'End of clip' : 'End of the test'), h('p', null, i + 1 < plan.length ? 'The next clip will start shortly.' : 'Working out your score…'));
      await wait(1400);
    }
  }
  if (aborted) return;
  const total = results.reduce((a, c) => a + c.scores.reduce((x, y) => x + y, 0), 0);
  const max = results.reduce((a, c) => a + c.hazards.length * 5, 0);
  const rec = { id: `h${Date.now().toString(36)}`, ts: Date.now(), full: true, mcqId, total, max, pass: total >= HPT.pass, clips: results };
  store.addHpt(rec);
  leave();
  location.hash = mcqId ? `#/hazard/final/${mcqId}~${rec.id}` : `#/hazard/results/${rec.id}`;
}

function playClip(shell, clip) {
  return new Promise((resolve) => {
    const onDown = (e) => {
      if (e.target.closest && e.target.closest('.hpt-close')) return;
      if (!player || !player.playing) return;
      e.preventDefault();
      const t = player.tap();
      if (t != null) { addFlag(shell.flags, t, clip.duration); pulse(shell.frame, e.clientX, e.clientY); }
    };
    const onKey = (e) => { if (e.code === 'Space' || e.key === 'Enter') onDown({ target: shell.el, preventDefault: () => e.preventDefault(), clientX: 0, clientY: 0 }); };
    shell.el.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    const off = () => { shell.el.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
    cleanup.push(off);
    player.onEnd = (clicks) => { off(); resolve(clicks); };
    player.play();
  });
}

// ---- Single clip practice ----------------------------------------------------------------

async function runPractice(template) {
  const seed = newSeed();
  const shell = overlayShell({ onClose: () => { leave(); location.hash = '#/hazard/practice'; }, closeLabel: 'Close' });
  try { await getPlayer(shell.frame, { mode: 'test' }); } catch (e) { showOverlay(shell.overlay, errorBox(e)); return; }
  showOverlay(shell.overlay, h('h2', null, 'Practice clip'), h('p', null, 'Loading…'));
  const clip = makeClip(seed, { template: template || undefined });
  await player.load(clip);
  await countdown(shell.overlay, 'Practice clip', 'Tap when you see a developing hazard');
  hideOverlay(shell.overlay);
  const clicks = await playClip(shell, clip);
  const sc = scoreClip(clip.hazards, clicks);
  const total = sc.scores.reduce((a, b) => a + b, 0);
  const rec = { id: `h${Date.now().toString(36)}`, ts: Date.now(), full: false, total, max: clip.hazards.length * 5, pass: null,
    clips: [{ seed, template: clip.template, env: clip.env, double: false, time: clip.time, weather: clip.weather, hazards: clip.hazards, clicks, scores: sc.scores, raw: sc.rawScores, pattern: sc.pattern }] };
  store.addHpt(rec);
  leave();
  location.hash = `#/hazard/review/${rec.id}~0`;
}

// ---- Results and review --------------------------------------------------------------------

function clipScore(c) { return c.scores.reduce((a, b) => a + b, 0); }

function renderResults(id) {
  const rec = store.getHpt(id);
  const main = page({ title: 'Hazard perception results', back: '#/hazard' });
  if (!rec) { main.appendChild(h('p', null, 'Result not found.')); return; }
  main.appendChild(resultHero(rec));
  main.appendChild(clipList(rec));
  main.appendChild(h('div', { class: 'btn-row', style: { marginTop: '14px' } },
    h('a', { class: 'btn', href: rec.full ? '#/hazard/test' : '#/hazard/clip' }, rec.full ? 'Take another test' : 'Another clip'),
    h('a', { class: 'btn secondary', href: '#/hazard' }, 'Done')));
}

function resultHero(rec) {
  return h('div', { class: 'card result-hero' },
    h('div', { class: 'muted' }, rec.full ? 'Hazard perception' : 'Practice'),
    h('div', { class: 'big' }, `${rec.total}/${rec.max}`),
    rec.full ? h('div', { class: `verdict ${rec.pass ? 'pass' : 'fail'}` }, rec.pass ? 'PASS' : 'FAIL') : null,
    rec.full ? h('p', { class: 'muted', style: { marginTop: '10px' } }, `The pass mark is ${HPT.pass} out of ${HPT.max}.`) : null);
}

function clipList(rec) {
  return h('div', { class: 'card', style: { padding: 0, marginTop: '12px' } },
    h('div', { style: { padding: '14px 14px 4px' } }, h('h2', null, 'Clips'), h('p', { class: 'small muted' }, 'Tap a clip to watch it again with its scoring window.')),
    rec.clips.map((c, i) => {
      const s = clipScore(c);
      const avg = c.hazards.length ? Math.round(s / c.hazards.length) : 0;
      return h('a', { class: 'clip-row', href: `#/hazard/review/${rec.id}~${i}`, style: { textDecoration: 'none', color: 'inherit' } },
        h('div', { class: `clip-score s${avg}` }, String(s)),
        h('div', { class: 'grow', style: { flex: 1, minWidth: 0 } },
          h('div', { style: { fontWeight: 600 } }, `Clip ${i + 1}${c.hazards.length > 1 ? ' · 2 hazards' : ''}`),
          h('div', { class: 'small muted' }, c.pattern ? 'Scored 0: responded continuously or in a pattern' : c.hazards.map((hz, k) => `${hz.label} (${c.scores[k]})`).join(' · '))),
        h('span', { class: 'chev', html: icon('chev') }));
    }));
}

function renderBreak(mcqId) {
  const t = store.getTest(mcqId);
  const main = page({ title: 'Full theory test', tabs: false });
  let left = 180;
  const timer = h('div', { class: 'big', style: { fontSize: '2.4rem', fontWeight: 800 } }, fmtTime(left));
  main.appendChild(h('div', { class: 'card result-hero' },
    h('h2', null, 'Part 1 complete'),
    h('p', { class: 'muted' }, "You can now take a break of up to 3 minutes. You'll see your results at the end."),
    timer,
    h('button', { class: 'btn', onclick: () => go() }, 'Start the hazard perception test')));
  const iv = setInterval(() => { left--; timer.textContent = fmtTime(left); if (left <= 0) go(); }, 1000);
  cleanup.push(() => clearInterval(iv));
  let started = false;
  function go() {
    if (started) return;
    started = true;
    clearInterval(iv);
    runTest({ mcqId: t ? mcqId : null });
  }
}

function renderFinal(mcqId, hptId) {
  const m = store.getTest(mcqId);
  const hp = store.getHpt(hptId);
  const main = page({ title: 'Theory test result', back: '#/' });
  if (!m || !hp) { main.appendChild(h('p', null, 'Result not found.')); return; }
  const pass = m.pass && hp.pass;
  main.appendChild(h('div', { class: 'card result-hero' },
    h('div', { class: 'muted' }, 'Car theory test'),
    h('div', { class: `verdict ${pass ? 'pass' : 'fail'}`, style: { fontSize: '1.3rem' } }, pass ? 'PASS' : 'FAIL'),
    h('p', { class: 'muted', style: { marginTop: '10px' } }, pass ? 'You passed both parts.' : 'You must pass both parts to pass the theory test.')));
  main.appendChild(h('div', { class: 'list', style: { marginTop: '12px' } },
    h('a', { class: 'list-row', href: `#/results/${m.id}` },
      h('div', { class: 'grow' }, h('div', null, 'Multiple-choice questions'), h('div', { class: 'sub' }, `Pass mark ${MOCK.pass} out of ${MOCK.questions}`)),
      h('b', null, `${m.score}/${m.total}`), h('span', { class: `pill ${m.pass ? 'pass' : 'fail'}` }, m.pass ? 'Pass' : 'Fail')),
    h('a', { class: 'list-row', href: `#/hazard/results/${hp.id}` },
      h('div', { class: 'grow' }, h('div', null, 'Hazard perception'), h('div', { class: 'sub' }, `Pass mark ${HPT.pass} out of ${HPT.max}`)),
      h('b', null, `${hp.total}/${hp.max}`), h('span', { class: `pill ${hp.pass ? 'pass' : 'fail'}` }, hp.pass ? 'Pass' : 'Fail'))));
}

async function renderReview(id, index) {
  const rec = store.getHpt(id);
  if (!rec || !rec.clips[index]) { page({ title: 'Clip review', back: '#/hazard' }).appendChild(h('p', null, 'Clip not found.')); return; }
  const c = rec.clips[index];
  const main = page({ title: rec.full ? `Clip ${index + 1} of ${rec.clips.length}` : 'Practice clip', back: rec.full ? `#/hazard/results/${id}` : '#/hazard' });
  const frame = h('div', { class: 'vid-wrap' });
  main.appendChild(frame);
  const tl = h('div', { class: 'timeline' });
  main.appendChild(tl);
  const controls = h('div', { class: 'btn-row' });
  main.appendChild(controls);
  const info = h('div', { class: 'card', style: { marginTop: '12px' } });
  main.appendChild(info);
  const loading = h('div', { class: 'vid-overlay' }, 'Loading clip…');
  frame.appendChild(loading);
  let clip;
  try {
    clip = makeClip(c.seed, { template: c.template[0], env: c.env, double: c.double });
    await getPlayer(frame, { mode: 'review' });
    await player.load(clip);
  } catch (e) { loading.textContent = String(e.message || e); return; }
  loading.remove();
  const dur = clip.duration;
  const pct = (t) => `${(100 * t) / dur}%`;
  // timeline: scoring windows as five coloured bands, the user's flags, and a playhead
  for (const hz of c.hazards) {
    const w = (hz.end - hz.start) / 5;
    for (let k = 0; k < 5; k++) tl.appendChild(h('div', { class: 'win', style: { left: pct(hz.start + k * w), width: pct(w), background: BAND_COLOURS[k], opacity: 0.85 } }));
  }
  for (const t of c.clicks) tl.appendChild(h('div', { class: 'flagmark', style: { left: pct(t) } }));
  const axis = h('div', { class: 'axis' });
  for (let s = 0; s <= dur; s += 10) axis.appendChild(h('span', { style: { left: pct(s) } }, `${s}s`));
  tl.appendChild(axis);
  const head = h('div', { class: 'playhead', style: { position: 'absolute', top: 0, bottom: 0, width: '2px', background: 'var(--text)', left: 0 } });
  tl.appendChild(head);
  const seekFromEvent = (e) => {
    const r = tl.getBoundingClientRect();
    player.pause();
    player.seek(((e.clientX - r.left) / r.width) * dur);
    playBtn.textContent = 'Play';
  };
  tl.addEventListener('pointerdown', (e) => { seekFromEvent(e); const mv = (ev) => seekFromEvent(ev); const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); });
  player.onTick = (t) => { head.style.left = pct(t); };
  player.onEnd = () => { playBtn.textContent = 'Play again'; };
  const playBtn = h('button', { class: 'btn', onclick: () => {
    if (player.playing) { player.pause(); playBtn.textContent = 'Play'; } else { player.play(); playBtn.textContent = 'Pause'; }
  } }, 'Play');
  controls.appendChild(playBtn);
  c.hazards.forEach((hz, k) => controls.appendChild(h('button', { class: 'btn secondary', onclick: () => { player.pause(); player.seek(Math.max(0, hz.start - 4)); player.play(); playBtn.textContent = 'Pause'; } }, c.hazards.length > 1 ? `Hazard ${k + 1}` : 'Go to hazard')));
  const total = clipScore(c);
  info.appendChild(h('h2', null, `You scored ${total} out of ${c.hazards.length * 5}`));
  if (c.pattern) info.appendChild(h('div', { class: 'notice', style: { marginBottom: '10px' } }, `${c.pattern} In the real test this scores zero for the clip. Your taps would otherwise have scored ${c.raw.reduce((a, b) => a + b, 0)}.`));
  c.hazards.forEach((hz, k) => {
    const hit = c.clicks.filter((t) => t >= hz.start && t <= hz.end).sort((a, b) => a - b)[0];
    const before = c.clicks.filter((t) => t < hz.start && t > hz.start - 4).length;
    let note;
    if (hit != null) note = `You tapped ${(hit - hz.start).toFixed(1)} seconds after the hazard started to develop, which scores ${c.raw[k]}.`;
    else if (before) note = 'You tapped just before the scoring window opened. Taps that early don\'t score — tap again once you see the hazard actually starting to develop.';
    else note = "You didn't tap during the scoring window, so this hazard scored 0.";
    info.appendChild(h('div', { style: { margin: '10px 0' } },
      h('h3', null, c.hazards.length > 1 ? `Hazard ${k + 1}: ${hz.label}` : hz.label),
      h('p', { class: 'small', style: { margin: '4px 0' } }, hz.desc),
      h('p', { class: 'small muted', style: { margin: 0 } }, `Scoring window: ${hz.start.toFixed(1)}s to ${hz.end.toFixed(1)}s. `, note)));
  });
  info.appendChild(h('div', { class: 'score-bands', style: { marginTop: '8px' } }, [5, 4, 3, 2, 1].map((s, i) => h('span', { style: { background: BAND_COLOURS[i] } }, `${s} points`))));
  const nav = h('div', { class: 'btn-row', style: { marginTop: '12px' } });
  if (rec.full && index > 0) nav.appendChild(h('a', { class: 'btn secondary', href: `#/hazard/review/${id}~${index - 1}` }, '‹ Previous clip'));
  if (rec.full && index < rec.clips.length - 1) nav.appendChild(h('a', { class: 'btn secondary', href: `#/hazard/review/${id}~${index + 1}` }, 'Next clip ›'));
  if (!rec.full) nav.appendChild(h('a', { class: 'btn', href: '#/hazard/clip' }, 'Try another clip'));
  main.appendChild(nav);
  player.seek(Math.max(0, c.hazards[0].start - 4));
}
