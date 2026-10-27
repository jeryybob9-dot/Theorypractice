// Multiple-choice test runner. Mock tests mirror the real test: 50 questions, 57 minutes,
// flag / previous / next / review, no feedback until the end, pass mark 43.
import { h, icon, fmtTime, newSeed, clear } from './util.js';
import { app, confirmDialog, speak, stopSpeaking } from './ui.js';
import { store } from './store.js';
import { MOCK, topicById, TOPICS } from './data.js';
import { mockTest, practiceSet, rebuild } from './questions.js';
import { refButtons } from './hc.js';
import { go as nav } from './nav.js';

let S = null;          // active test state
let timerHandle = null;
let lastTick = 0;
let videoCtl = null;   // case study video player for the current screen

export function activeTest() {
  if (!S) S = store.active();
  return S;
}

function save() { if (S) store.saveActive(S); }

export async function startMock({ full = false } = {}) {
  const seed = newSeed();
  const settings = store.settings();
  let video = null;
  let videoQs = [];
  try {
    const cs = await import('./hpt/casestudy.js');
    const made = cs.makeCaseStudy(seed);
    if (made) { video = made.video; videoQs = made.questions; }
  } catch (e) {
    console.warn('Video case study unavailable', e);
  }
  const questions = [...mockTest(seed, { videoCount: videoQs.length }), ...videoQs];
  const minutes = MOCK.minutes * (settings.extraTime ? 1.25 : 1);
  S = {
    id: `t${Date.now().toString(36)}`, type: full ? 'full' : 'mock', seed, created: Date.now(),
    questions, answers: questions.map(() => null), flags: questions.map(() => false), revealed: questions.map(() => false),
    current: 0, timeLimit: Math.round(minutes * 60), elapsed: 0, phase: 'q', filter: null, video, feedback: false,
  };
  save();
  nav('#/test');
}

export function startPractice({ topics, count, mode, title }) {
  const seed = newSeed();
  const questions = practiceSet(seed, { topics, count, mode });
  if (!questions.length) return false;
  S = {
    id: `p${Date.now().toString(36)}`, type: 'practice', title: title || 'Practice', seed, created: Date.now(),
    questions, answers: questions.map(() => null), flags: questions.map(() => false), revealed: questions.map(() => false),
    current: 0, timeLimit: 0, elapsed: 0, phase: 'q', filter: null, video: null, feedback: store.settings().practiceFeedback,
  };
  save();
  nav('#/test');
  return true;
}

export function renderTest() {
  activeTest();
  if (!S) { nav('#/tests'); return; }
  startTimer();
  if (S.phase === 'review') renderReview(); else renderQuestion();
}

export function leaveTest() {
  stopTimer();
  stopSpeaking();
  if (videoCtl) { videoCtl.destroy(); videoCtl = null; }
}

function startTimer() {
  stopTimer();
  lastTick = performance.now();
  timerHandle = setInterval(tick, 250);
  document.addEventListener('visibilitychange', onVis);
}

function stopTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = null;
  document.removeEventListener('visibilitychange', onVis);
}

function onVis() {
  // Keep counting while hidden (the real test doesn't pause), but resync the clock.
  if (!document.hidden) tick();
}

function tick() {
  if (!S) return;
  const now = performance.now();
  S.elapsed += (now - lastTick) / 1000;
  lastTick = now;
  const el = document.getElementById('test-timer');
  if (el) {
    if (S.timeLimit) {
      const left = S.timeLimit - S.elapsed;
      el.textContent = fmtTime(left);
      el.classList.toggle('low', left < 300);
      if (left <= 0) { finish(true); return; }
    } else {
      el.textContent = fmtTime(S.elapsed);
    }
  }
  if (Math.floor(S.elapsed) % 5 === 0) save();
}

function header() {
  const settings = store.settings();
  const n = S.questions.length;
  const head = h('div', { class: 'test-head' },
    h('button', { class: 'icon-btn', 'aria-label': 'Exit test', html: icon('close'), onclick: exitPrompt }),
    h('div', { class: 'qnum' }, S.phase === 'review' ? 'Review' : `Question ${S.current + 1} of ${n}`),
    settings.voiceover && S.phase !== 'review' ? h('button', { class: 'icon-btn', 'aria-label': 'Read question aloud', html: icon('speaker'), onclick: readAloud }) : null,
    h('div', { class: 'timer', id: 'test-timer', 'aria-label': S.timeLimit ? 'Time remaining' : 'Time taken' },
      fmtTime(S.timeLimit ? S.timeLimit - S.elapsed : S.elapsed)));
  const answered = S.answers.filter((a) => a != null).length;
  const prog = h('div', { class: 'test-progress' }, h('i', { style: { width: `${(100 * answered) / n}%` } }));
  return [head, prog];
}

async function exitPrompt() {
  const ok = await confirmDialog({
    title: S.type === 'practice' ? 'Finish practice?' : 'Leave this test?',
    text: S.type === 'practice' ? 'Your answers so far will be marked.' : 'You can come back to it later from the Tests tab, or end it now and see your score.',
    ok: S.type === 'practice' ? 'Finish and mark' : 'End test now', cancel: 'Keep going',
  });
  if (!ok) return;
  finish(false);
}

function readAloud() {
  const q = S.questions[S.current];
  const letters = 'ABCD';
  speak(`${q.q} ${q.options.map((o, i) => `${letters[i]}. ${o.text || o.alt || ''}`).join('. ')}`);
}

function renderQuestion() {
  const i = S.current;
  const q = S.questions[i];
  const revealed = S.feedback && S.revealed[i];
  const root = clear(app());
  if (videoCtl) { videoCtl.destroy(); videoCtl = null; }
  const body = h('div', { class: 'test-body' });
  const screen = h('div', { class: 'test' }, ...header(), body);
  root.appendChild(screen);
  window.scrollTo(0, 0);

  if (S.type === 'practice') body.appendChild(h('div', { class: 'q-topic' }, topicById[q.topic]?.name || ''));
  if (q.video && S.video) {
    const holder = h('div');
    body.appendChild(holder);
    body.appendChild(h('p', { class: 'small muted' }, 'Questions ', String(S.questions.findIndex((x) => x.video) + 1), ' to ', String(S.questions.length), ' are about this clip. You can watch it as many times as you like.'));
    import('./hpt/casestudy.js').then((cs) => { if (S && S.current === i) videoCtl = cs.mountCaseVideo(holder, S.video); })
      .catch((e) => holder.appendChild(h('div', { class: 'notice' }, 'The video clip could not be played on this device. ', String(e.message || e))));
  }
  body.appendChild(h('div', { class: 'q-text' }, q.q));
  if (q.img) body.appendChild(h('div', { class: 'q-img' }, h('img', { src: q.img, alt: 'Image for this question' })));
  body.appendChild(h('div', { class: 'q-instr' }, 'Mark one answer'));
  const letters = 'ABCD';
  const answers = h('div', { class: `answers ${q.imageOptions ? 'images' : ''}` });
  q.options.forEach((o, k) => {
    let cls = 'answer' + (q.imageOptions ? ' img-ans' : '');
    if (revealed) {
      if (k === q.correct) cls += ' correct';
      else if (k === S.answers[i]) cls += ' wrong';
    } else if (S.answers[i] === k) cls += ' selected';
    const btn = h('button', { class: cls, disabled: revealed, 'aria-pressed': S.answers[i] === k ? 'true' : 'false', onclick: () => choose(k) },
      h('span', { class: 'key' }, letters[k]),
      o.img ? h('img', { src: o.img, alt: `Option ${letters[k]}` }) : h('span', null, o.text));
    answers.appendChild(btn);
  });
  body.appendChild(answers);
  if (revealed) {
    const ok = S.answers[i] === q.correct;
    body.appendChild(h('div', { class: `feedback ${ok ? 'good' : 'bad'}` },
      h('h3', null, ok ? 'Correct' : 'Incorrect'),
      h('p', null, q.explain),
      refButtons(q.ref)));
  }
  body.appendChild(footer());
}

function footer() {
  const i = S.current;
  const n = S.questions.length;
  const flagged = S.flags[i];
  const practice = S.type === 'practice';
  const flagBtn = h('button', { class: `btn secondary ${flagged ? 'flagged' : ''}`, onclick: toggleFlag, 'aria-pressed': flagged ? 'true' : 'false' });
  flagBtn.innerHTML = `<span class="flag-ico">${icon('flag')}</span> ${flagged ? 'Flagged' : 'Flag'}`;
  const isLast = i === n - 1;
  return h('div', { class: 'test-foot' },
    h('button', { class: 'btn secondary', disabled: i === 0, onclick: () => go(i - 1) }, 'Previous'),
    flagBtn,
    h('button', { class: 'btn secondary', onclick: () => { S.phase = 'review'; S.filter = null; save(); renderReview(); } }, practice ? 'Overview' : 'Review'),
    isLast
      ? h('button', { class: 'btn', onclick: () => { S.phase = 'review'; save(); renderReview(); } }, practice ? 'Finish' : 'Review')
      : h('button', { class: 'btn', onclick: () => nextFrom(i) }, 'Next'));
}

function nextFrom(i) {
  // In "review flagged/incomplete" mode, Next jumps to the next question in that set.
  if (S.filter) {
    const list = filterList(S.filter);
    const nx = list.find((k) => k > i);
    if (nx == null) { S.phase = 'review'; save(); renderReview(); return; }
    go(nx);
    return;
  }
  go(i + 1);
}

function choose(k) {
  const i = S.current;
  if (S.feedback && S.revealed[i]) return;
  S.answers[i] = k;
  if (S.feedback) S.revealed[i] = true;
  save();
  renderQuestion();
  if (S.feedback) {
    const fb = document.querySelector('.feedback');
    fb && fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function toggleFlag() {
  S.flags[S.current] = !S.flags[S.current];
  save();
  renderQuestion();
}

function go(i) {
  if (i < 0 || i >= S.questions.length) return;
  stopSpeaking();
  S.current = i;
  S.phase = 'q';
  save();
  renderQuestion();
}

function filterList(f) {
  return S.questions.map((_, k) => k).filter((k) => (f === 'flagged' ? S.flags[k] : f === 'incomplete' ? S.answers[k] == null : true));
}

function renderReview() {
  if (videoCtl) { videoCtl.destroy(); videoCtl = null; }
  const root = clear(app());
  const body = h('div', { class: 'test-body' });
  root.appendChild(h('div', { class: 'test' }, ...header(), body));
  window.scrollTo(0, 0);
  const n = S.questions.length;
  const answered = S.answers.filter((a) => a != null).length;
  const flagged = S.flags.filter(Boolean).length;
  const practice = S.type === 'practice';
  body.appendChild(h('h2', null, practice ? 'Overview' : 'Review your answers'));
  body.appendChild(h('p', { class: 'muted' },
    `You've answered ${answered} of ${n} questions`, flagged ? ` and flagged ${flagged}.` : '.',
    !practice && answered < n ? ' Unanswered questions are marked as wrong.' : ''));
  body.appendChild(h('div', { class: 'legend' }, h('span', null, h('i', { class: 'answered' }), 'Answered'), h('span', null, h('i'), 'Not answered'), h('span', null, h('i', { class: 'flagged' }), 'Flagged')));
  const grid = h('div', { class: 'review-grid' });
  S.questions.forEach((q, k) => {
    let cls = '';
    if (S.feedback && S.revealed[k]) cls = S.answers[k] === q.correct ? 'correct' : 'wrong';
    else if (S.answers[k] != null) cls = 'answered';
    if (S.flags[k]) cls += ' flagged';
    grid.appendChild(h('button', { class: cls, onclick: () => { S.filter = null; go(k); }, 'aria-label': `Question ${k + 1}` }, String(k + 1)));
  });
  body.appendChild(grid);
  const firstOf = (f) => filterList(f)[0];
  body.appendChild(h('div', { class: 'stack' },
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn secondary', onclick: () => { S.filter = 'all'; go(0); } }, 'Review all'),
      h('button', { class: 'btn secondary', disabled: answered === n, onclick: () => { S.filter = 'incomplete'; go(firstOf('incomplete')); } }, `Review incomplete (${n - answered})`)),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn secondary', disabled: !flagged, onclick: () => { S.filter = 'flagged'; go(firstOf('flagged')); } }, `Review flagged (${flagged})`)),
    h('button', { class: 'btn block danger', onclick: endPrompt }, practice ? 'Finish and see results' : 'End test')));
}

async function endPrompt() {
  const n = S.questions.length;
  const left = n - S.answers.filter((a) => a != null).length;
  if (S.type !== 'practice' || left) {
    const ok = await confirmDialog({
      title: 'End the test?',
      text: left ? `You have ${left} unanswered question${left > 1 ? 's' : ''}. You won't be able to change your answers after this.` : "You won't be able to change your answers after this.",
      ok: 'End test', cancel: 'Go back', danger: true,
    });
    if (!ok) return;
  }
  finish(false);
}

function finish(timedOut) {
  if (!S) return;
  leaveTest();
  const items = S.questions.map((q, k) => ({
    id: q.id, seed: q.seed, topic: q.topic, chosen: S.answers[k], correct: q.correct, flagged: S.flags[k],
    ...(q.video ? { inst: q } : {}),
  }));
  const answeredItems = S.type === 'practice' ? items.filter((x) => x.chosen != null) : items;
  const score = answeredItems.filter((x) => x.chosen === x.correct).length;
  const total = answeredItems.length;
  const byTopic = {};
  for (const x of answeredItems) {
    const t = byTopic[x.topic] || (byTopic[x.topic] = [0, 0]);
    t[1]++;
    if (x.chosen === x.correct) t[0]++;
  }
  const isMock = S.type !== 'practice';
  const record = {
    id: S.id, ts: Date.now(), type: S.type, title: S.title || (isMock ? 'Mock test' : 'Practice'),
    score, total, passMark: isMock ? MOCK.pass : null, pass: isMock ? score >= MOCK.pass : null,
    duration: Math.round(S.elapsed), timeLimit: S.timeLimit, timedOut, byTopic, items: answeredItems, video: S.video,
  };
  store.recordAnswers(answeredItems.map((x) => ({ id: x.id, correct: x.chosen === x.correct })));
  if (total) store.addTest(record);
  const full = S.type === 'full';
  S = null;
  store.clearActive();
  if (!total) { nav('#/tests'); return; }
  nav(full ? `#/hazard/full/${record.id}` : `#/results/${record.id}`);
}

// ---------------------------------------------------------------------------------------------
// Results

export function renderResults(id, { page: makePage }) {
  const t = store.getTest(id);
  const main = makePage({ title: t && t.type === 'practice' ? 'Practice results' : 'Test results', back: '#/tests' });
  if (!t) { main.appendChild(h('p', null, 'That test result could not be found.')); return; }
  const mock = t.type !== 'practice';
  const hero = h('div', { class: 'card result-hero' },
    h('div', { class: 'muted' }, mock ? 'Multiple-choice questions' : t.title),
    h('div', { class: 'big' }, `${t.score}/${t.total}`),
    mock ? h('div', { class: `verdict ${t.pass ? 'pass' : 'fail'}` }, t.pass ? 'PASS' : 'FAIL') : h('div', { class: 'muted' }, `${Math.round((100 * t.score) / Math.max(1, t.total))}% correct`),
    mock ? h('p', { class: 'muted', style: { marginTop: '10px' } }, `The pass mark is ${t.passMark} out of 50.`, t.timedOut ? ' Time ran out.' : '', ` Time taken: ${fmtTime(t.duration)}.`) : null);
  main.appendChild(hero);

  const topicCard = h('div', { class: 'card' }, h('h2', null, 'By topic'));
  const weak = [];
  for (const topic of [...TOPICS, topicById.video]) {
    const v = t.byTopic[topic.id];
    if (!v) continue;
    const p = v[0] / v[1];
    if (p < 0.8 && topic.id !== 'video') weak.push(topic.id);
    topicCard.appendChild(h('div', { class: 'topic-row' },
      h('div', { class: 'row' }, h('span', null, topic.name), h('b', null, `${v[0]}/${v[1]}`)),
      h('div', { class: `bar ${p >= 0.86 ? 'good' : p >= 0.6 ? 'warn' : 'bad'}` }, h('i', { style: { width: `${100 * p}%` } }))));
  }
  main.appendChild(topicCard);
  const actions = h('div', { class: 'btn-row', style: { margin: '14px 0' } });
  if (weak.length) actions.appendChild(h('button', { class: 'btn', onclick: () => startPractice({ topics: weak, count: 20, mode: 'mixed', title: 'Weak topics' }) }, 'Practise weak topics'));
  actions.appendChild(h('button', { class: 'btn secondary', onclick: () => (mock ? startMock() : (nav('#/practice'))) }, mock ? 'New mock test' : 'Practise again'));
  main.appendChild(actions);

  if (!t.items) return;
  const filterSeg = h('div', { class: 'seg' });
  const list = h('div');
  let filter = 'wrong';
  const renderList = () => {
    clear(filterSeg);
    for (const [k, label] of [['wrong', 'Incorrect'], ['all', 'All questions']]) {
      filterSeg.appendChild(h('button', { 'aria-pressed': filter === k ? 'true' : 'false', onclick: () => { filter = k; renderList(); } }, label));
    }
    clear(list);
    const letters = 'ABCD';
    t.items.forEach((x, k) => {
      const right = x.chosen === x.correct;
      if (filter === 'wrong' && right) return;
      const q = x.inst || rebuild(x.id, x.seed);
      if (!q) return;
      const opt = (i) => (i == null ? 'No answer' : (q.options[i].text || `Image ${letters[i]}`));
      list.appendChild(h('div', { class: 'rev-item' },
        h('div', { class: 'small muted' }, `Question ${k + 1} · ${topicById[x.topic]?.name || ''}${x.flagged ? ' · flagged' : ''}`),
        h('div', { style: { fontWeight: 650, marginTop: '2px' } }, q.q),
        q.img ? h('div', { class: 'q-img', style: { justifyContent: 'flex-start', margin: '8px 0' } }, h('img', { src: q.img, alt: '', style: { maxHeight: '110px' } })) : null,
        q.imageOptions ? h('div', { class: 'row', style: { gap: '8px', margin: '8px 0' } }, q.options.map((o, i) =>
          h('img', { src: o.img, alt: '', style: { height: '56px', background: '#fff', borderRadius: '6px', padding: '3px', outline: i === q.correct ? '3px solid var(--good)' : i === x.chosen ? '3px solid var(--bad)' : '1px solid var(--line)' } }))) : null,
        !q.imageOptions && !right ? h('div', { class: 'ans-line bad' }, `✗ Your answer: ${opt(x.chosen)}`) : null,
        !q.imageOptions ? h('div', { class: 'ans-line good' }, `✓ Correct answer: ${opt(q.correct)}`) : null,
        q.imageOptions && !right ? h('div', { class: 'ans-line bad' }, x.chosen == null ? '✗ Not answered' : '✗ Your answer is outlined in red, the correct one in green') : null,
        h('p', { class: 'small', style: { marginTop: '6px', marginBottom: '0' } }, q.explain),
        refButtons(q.ref)));
    });
    if (!list.children.length) list.appendChild(h('p', { class: 'muted', style: { padding: '12px 0' } }, 'No incorrect answers. Well done!'));
  };
  main.appendChild(h('div', { class: 'card' }, h('h2', null, 'Check your answers'), filterSeg, list));
  renderList();
}
