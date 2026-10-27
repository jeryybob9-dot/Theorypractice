// Shared page chrome: top bar, tab bar, bottom sheets and dialogs.
import { h, icon, clear } from './util.js';

export const app = () => document.getElementById('app');

const TABS = [
  { href: '#/', label: 'Home', icon: 'home', match: /^#\/?$/ },
  { href: '#/tests', label: 'Tests', icon: 'test', match: /^#\/(tests|practice|mock|results)/ },
  { href: '#/hazard', label: 'Hazards', icon: 'hazard', match: /^#\/hazard/ },
  { href: '#/learn', label: 'Learn', icon: 'book', match: /^#\/(learn|hc|signs)/ },
  { href: '#/progress', label: 'Progress', icon: 'chart', match: /^#\/(progress|settings|about)/ },
];

export function page({ title, back, actions, tabs = true }, ...content) {
  const top = h('header', { class: 'topbar' },
    back ? h('button', { class: 'icon-btn', 'aria-label': 'Back', html: icon('back'), onclick: () => (typeof back === 'string' ? (location.hash = back) : history.back()) }) : null,
    h('h1', null, title),
    actions || null,
  );
  const main = h('main', { class: 'content' }, ...content);
  const nav = tabs ? tabbar() : null;
  const screen = h('div', { class: 'screen' }, top, main, nav);
  const root = clear(app());
  root.appendChild(screen);
  window.scrollTo(0, 0);
  return main;
}

function tabbar() {
  const hash = location.hash || '#/';
  return h('nav', { class: 'tabbar', 'aria-label': 'Sections' },
    TABS.map((t) => {
      const a = h('a', { href: t.href, class: t.match.test(hash) ? 'active' : '' });
      a.innerHTML = icon(t.icon);
      a.appendChild(h('span', null, t.label));
      return a;
    }));
}

export function openSheet(title, body, { onClose } = {}) {
  const root = document.getElementById('sheet-root');
  const close = () => { backdrop.remove(); document.body.style.overflow = ''; onClose && onClose(); };
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' },
      h('h2', null, title),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', html: icon('close'), onclick: close })),
    h('div', { class: 'sheet-body' }, body));
  const backdrop = h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } }, sheet);
  root.appendChild(backdrop);
  document.body.style.overflow = 'hidden';
  return { close, body: sheet.querySelector('.sheet-body') };
}

export function confirmDialog({ title, text, ok = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const root = document.getElementById('sheet-root');
    const done = (v) => { backdrop.remove(); resolve(v); };
    const box = h('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true' },
      h('h2', null, title),
      text ? h('p', { class: 'muted' }, text) : null,
      h('div', { class: 'btn-row' },
        cancel ? h('button', { class: 'btn secondary', onclick: () => done(false) }, cancel) : null,
        h('button', { class: `btn ${danger ? 'danger' : ''}`, onclick: () => done(true) }, ok)));
    const backdrop = h('div', { class: 'sheet-backdrop dialog-backdrop' }, box);
    root.appendChild(backdrop);
  });
}

export function errorBox(err) {
  return h('div', { class: 'notice' }, h('b', null, 'Something went wrong. '), String(err && err.message ? err.message : err));
}

export function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return false;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    u.rate = 0.95;
    const v = window.speechSynthesis.getVoices().find((x) => x.lang === 'en-GB');
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
    return true;
  } catch (e) {
    return false;
  }
}

export function stopSpeaking() {
  try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
}
