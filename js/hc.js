// The Highway Code reader, rule pop-ups and the sign gallery.
import { h, icon, esc } from './util.js';
import { page, openSheet, errorBox } from './ui.js';
import { loadHC, loadSigns, refInfo, sectionSlugFor } from './data.js';

const ATTRIB = 'The Highway Code © Crown copyright, from GOV.UK under the Open Government Licence v3.0.';

export async function renderLearn() {
  const main = page({ title: 'Learn' });
  main.appendChild(h('div', { class: 'grid-2' },
    tile('#/signs', 'Traffic signs', 'Every sign, marking and signal in the Highway Code', '#912b88', 'sign'),
    tile('#/hc', 'The Highway Code', 'All 307 rules, searchable and offline', '#1d70b8', 'book')));
  main.appendChild(h('p', { class: 'small muted', style: { marginTop: '16px' } }, ATTRIB));
}

function tile(href, title, sub, color, ico) {
  return h('a', { class: 'tile', href },
    h('div', { class: 'tile-ico', style: { background: color }, html: icon(ico) }),
    h('h3', null, title), h('p', null, sub));
}

export async function renderHCIndex(query = '') {
  const main = page({ title: 'The Highway Code', back: '#/learn' });
  let hc;
  try { hc = await loadHC(); } catch (e) { main.appendChild(errorBox(e)); return; }
  const input = h('input', { type: 'search', placeholder: 'Search the rules, e.g. "zebra" or "126"', value: query, 'aria-label': 'Search the Highway Code' });
  const results = h('div');
  const searchBox = h('div', { class: 'search' }, input);
  searchBox.insertAdjacentHTML('afterbegin', icon('search'));
  main.appendChild(searchBox);
  main.appendChild(h('div', { style: { height: '12px' } }));
  main.appendChild(results);
  const index = buildIndex(hc);
  const render = () => {
    const q = input.value.trim();
    results.innerHTML = '';
    if (!q) {
      results.appendChild(h('div', { class: 'list' }, hc.sections.map((s) =>
        h('a', { class: 'list-row', href: `#/hc/${s.slug}` },
          h('div', { class: 'grow' }, s.title),
          h('span', { class: 'chev', html: icon('chev') })))));
      results.appendChild(h('p', { class: 'small muted', style: { marginTop: '12px' } }, ATTRIB, ' Last updated on GOV.UK: ', (hc.updated || '').slice(0, 10), '.'));
      return;
    }
    const hits = search(index, q).slice(0, 60);
    if (!hits.length) { results.appendChild(h('p', { class: 'muted' }, 'No rules match that search.')); return; }
    results.appendChild(h('div', { class: 'list' }, hits.map((x) =>
      h('a', { class: 'list-row', href: `#/hc/${x.slug}/${x.anchor}` },
        h('div', { class: 'grow' },
          h('div', { style: { fontWeight: 650 } }, x.title),
          h('div', { class: 'sub', html: highlight(x.snippet, q) })),
        h('span', { class: 'chev', html: icon('chev') })))));
  };
  let t;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, 120); });
  render();
}

let INDEX = null;
function buildIndex(hc) {
  if (INDEX) return INDEX;
  INDEX = [];
  const tmp = document.createElement('div');
  for (const s of hc.sections) {
    tmp.innerHTML = s.html;
    let current = { slug: s.slug, anchor: '', title: s.title, text: '' };
    const push = () => { if (current.text.trim()) INDEX.push({ ...current, lower: current.text.toLowerCase() }); };
    for (const node of tmp.children) {
      if (/^H[23]$/.test(node.tagName) && node.id) {
        push();
        current = { slug: s.slug, anchor: node.id, title: node.tagName === 'H3' ? `${node.textContent} · ${shortTitle(s.title)}` : `${node.textContent} · ${shortTitle(s.title)}`, text: '' };
      } else {
        current.text += ' ' + node.textContent;
      }
    }
    push();
  }
  return INDEX;
}

function shortTitle(t) { return t.replace(/\s*\(.*\)\s*$/, ''); }

function search(index, q) {
  const ql = q.toLowerCase();
  const ruleNum = /^(?:rule\s*)?(h?\d+)$/i.exec(q);
  if (ruleNum) {
    const id = 'rule' + ruleNum[1].toLowerCase();
    const hit = index.filter((x) => x.anchor === id);
    if (hit.length) return hit.map((x) => ({ ...x, snippet: x.text.trim().slice(0, 160) }));
  }
  const terms = ql.split(/\s+/).filter(Boolean);
  const out = [];
  for (const x of index) {
    if (!terms.every((t) => x.lower.includes(t) || x.title.toLowerCase().includes(t))) continue;
    const i = x.lower.indexOf(terms[0]);
    const start = Math.max(0, i - 60);
    out.push({ ...x, score: terms.reduce((a, t) => a + (x.lower.split(t).length - 1), 0), snippet: (start ? '…' : '') + x.text.slice(start, start + 170).trim() + '…' });
  }
  return out.sort((a, b) => b.score - a.score);
}

function highlight(text, q) {
  let s = esc(text);
  for (const t of q.split(/\s+/).filter((x) => x.length > 1)) {
    s = s.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), (m) => `<mark>${m}</mark>`);
  }
  return s;
}

export async function renderHCSection(slug, anchor) {
  const main = page({ title: 'The Highway Code', back: '#/hc' });
  let hc;
  try { hc = await loadHC(); } catch (e) { main.appendChild(errorBox(e)); return; }
  const s = hc.sections.find((x) => x.slug === slug);
  if (!s) { main.appendChild(h('p', null, 'Section not found.')); return; }
  const i = hc.sections.indexOf(s);
  main.appendChild(h('h1', null, s.title));
  const body = h('article', { class: 'hc-content', html: s.html });
  main.appendChild(body);
  main.appendChild(h('div', { class: 'btn-row', style: { marginTop: '24px' } },
    i > 0 ? h('a', { class: 'btn secondary', href: `#/hc/${hc.sections[i - 1].slug}` }, '‹ Previous') : null,
    i < hc.sections.length - 1 ? h('a', { class: 'btn secondary', href: `#/hc/${hc.sections[i + 1].slug}` }, 'Next ›') : null));
  main.appendChild(h('p', { class: 'small muted', style: { marginTop: '16px' } }, ATTRIB, ' ',
    h('a', { href: `https://www.gov.uk/guidance/the-highway-code/${slug}`, target: '_blank', rel: 'noopener' }, 'View on GOV.UK')));
  if (anchor) {
    const target = body.querySelector(`#${CSS.escape(anchor)}`);
    if (target) {
      requestAnimationFrame(() => {
        target.scrollIntoView({ block: 'start' });
        target.classList.add('rule-hl');
      });
    }
  }
}

// HTML for a single rule: its heading up to the next rule or section heading.
export async function ruleHtml(rule) {
  const hc = await loadHC();
  const slug = hc.rules[String(rule).toUpperCase()] || hc.rules[String(rule)];
  if (!slug) return null;
  const s = hc.sections.find((x) => x.slug === slug);
  const tmp = document.createElement('div');
  tmp.innerHTML = s.html;
  const start = tmp.querySelector(`#rule${String(rule).toLowerCase()}`);
  if (!start) return null;
  const out = document.createElement('div');
  let n = start.nextElementSibling;
  while (n && !/^H[23]$/.test(n.tagName)) {
    out.appendChild(n.cloneNode(true));
    n = n.nextElementSibling;
  }
  return { slug, section: s.title, html: out.innerHTML };
}

export async function openRef(ref) {
  const info = refInfo(ref);
  if (info.kind === 'url') { window.open(info.url, '_blank', 'noopener'); return; }
  if (info.kind === 'rule') {
    const body = h('div', { class: 'hc-content' }, h('p', { class: 'muted' }, 'Loading…'));
    openSheet(`Rule ${info.rule}`, body);
    try {
      const r = await ruleHtml(info.rule);
      if (!r) { body.innerHTML = '<p>Rule not found.</p>'; return; }
      body.innerHTML = `<p class="small muted">${esc(r.section)}</p>${r.html}`;
      body.appendChild(h('p', null, h('a', { href: `#/hc/${r.slug}/rule${String(info.rule).toLowerCase()}`, onclick: () => document.querySelector('.sheet-backdrop')?.remove() }, 'Open in the Highway Code ›')));
      body.appendChild(h('p', { class: 'small muted' }, ATTRIB));
    } catch (e) { body.innerHTML = ''; body.appendChild(errorBox(e)); }
    return;
  }
  if (info.kind === 'section') {
    const hc = await loadHC();
    const slug = sectionSlugFor(info.name, hc);
    if (slug) { document.querySelector('.sheet-backdrop')?.remove(); location.hash = `#/hc/${slug}`; }
  }
}

export function refButtons(refs) {
  if (!refs || !refs.length) return null;
  return h('div', { class: 'refs' }, refs.map((r) =>
    h('button', { class: 'ref-link', onclick: () => openRef(r) }, refInfo(r).label)));
}

export async function renderSigns(group = 'all') {
  const main = page({ title: 'Traffic signs', back: '#/learn' });
  let data;
  try { data = await loadSigns(); } catch (e) { main.appendChild(errorBox(e)); return; }
  const groups = Object.entries(data.groups).filter(([g]) => data.signs.some((s) => s.group === g));
  const sel = h('select', { 'aria-label': 'Sign group', style: { width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--line)', background: 'var(--surface)' } },
    h('option', { value: 'all' }, 'All signs, markings and signals'),
    groups.map(([g, t]) => h('option', { value: g, selected: g === group }, t)));
  sel.addEventListener('change', () => { location.hash = `#/signs/${sel.value}`; });
  main.appendChild(sel);
  main.appendChild(h('div', { style: { height: '12px' } }));
  const shown = group === 'all' ? groups : groups.filter(([g]) => g === group);
  for (const [g, title] of shown) {
    main.appendChild(h('div', { class: 'section-title' }, title));
    main.appendChild(h('div', { class: 'sign-grid' }, data.signs.filter((s) => s.group === g).map((s) =>
      h('button', { class: 'sign-card', onclick: () => showSign(s) },
        h('img', { src: s.img, alt: '', loading: 'lazy' }), s.meaning.length > 70 ? s.meaning.slice(0, 68) + '…' : s.meaning))));
  }
  main.appendChild(h('p', { class: 'small muted', style: { marginTop: '16px' } }, ATTRIB));
}

function showSign(s) {
  openSheet('Sign', h('div', { class: 'center' },
    h('img', { src: s.img, alt: s.meaning, style: { maxHeight: '240px', background: '#fff', borderRadius: '8px', padding: '8px' } }),
    h('p', { style: { fontWeight: 650, marginTop: '12px' } }, s.meaning),
    s.rule ? refButtons([`HC ${s.rule}`]) : null));
}

export { ATTRIB };
