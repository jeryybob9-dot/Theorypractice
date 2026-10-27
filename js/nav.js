// Navigation. Normally routes live in the URL hash (#/tests, #/results/abc…) so the browser's back
// button works. Where the page is embedded somewhere that only allows plain #names, set
// window.__MEMORY_ROUTER__ before loading the app and routes are kept in memory instead.

const MEMORY = typeof window !== 'undefined' && !!window.__MEMORY_ROUTER__;
const stack = ['#/'];
const listeners = [];

export function current() {
  return MEMORY ? stack[stack.length - 1] : location.hash || '#/';
}

export function go(hash, { replace = false } = {}) {
  if (!hash.startsWith('#')) hash = '#' + hash;
  if (!MEMORY) {
    if (replace) location.replace(hash);
    else location.hash = hash;
    return;
  }
  if (replace) stack[stack.length - 1] = hash;
  else stack.push(hash);
  if (stack.length > 60) stack.splice(1, stack.length - 60);
  emit();
}

export function back(fallback = '#/') {
  if (!MEMORY) {
    if (history.length > 1) history.back();
    else go(fallback);
    return;
  }
  if (stack.length > 1) stack.pop();
  else stack[0] = fallback;
  emit();
}

export function onChange(fn) {
  listeners.push(fn);
  if (!MEMORY) window.addEventListener('hashchange', fn);
}

function emit() {
  for (const fn of listeners) fn();
}

if (MEMORY) {
  // in-page links like <a href="#/signs"> become in-memory navigation
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#/"]');
    if (!a) return;
    e.preventDefault();
    go(a.getAttribute('href'));
  });
}
