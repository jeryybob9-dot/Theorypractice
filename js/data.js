// Static data: the 14 DVSA theory test topics, and loaders for the question bank, signs and Highway Code.

export const TOPICS = [
  { id: 'alertness', name: 'Alertness', mock: 3, color: '#1d70b8' },
  { id: 'attitude', name: 'Attitude', mock: 3, color: '#4c2c92' },
  { id: 'safety-vehicle', name: 'Safety and your vehicle', mock: 4, color: '#00703c' },
  { id: 'safety-margins', name: 'Safety margins', mock: 3, color: '#b58840' },
  { id: 'hazard-awareness', name: 'Hazard awareness', mock: 5, color: '#d4351c' },
  { id: 'vulnerable-road-users', name: 'Vulnerable road users', mock: 5, color: '#d53880' },
  { id: 'other-vehicles', name: 'Other types of vehicle', mock: 2, color: '#28a197' },
  { id: 'vehicle-handling', name: 'Vehicle handling', mock: 3, color: '#f47738' },
  { id: 'motorway-rules', name: 'Motorway rules', mock: 4, color: '#005ea5' },
  { id: 'rules-of-the-road', name: 'Rules of the road', mock: 5, color: '#6f72af' },
  { id: 'road-signs', name: 'Road and traffic signs', mock: 5, color: '#912b88' },
  { id: 'documents', name: 'Essential documents', mock: 2, color: '#505a5f' },
  { id: 'incidents', name: 'Incidents, accidents and emergencies', mock: 2, color: '#942514' },
  { id: 'vehicle-loading', name: 'Vehicle loading', mock: 1, color: '#85994b' },
];
export const VIDEO_TOPIC = { id: 'video', name: 'Video clip questions', color: '#0b0c0c' };
export const topicById = Object.fromEntries([...TOPICS, VIDEO_TOPIC].map((t) => [t.id, t]));

// The real car theory test (GOV.UK, "Theory test: cars").
export const MOCK = { questions: 50, video: 3, minutes: 57, pass: 43 };
export const HPT = { clips: 14, hazards: 15, max: 75, pass: 44 };

const cache = {};
async function getJSON(url) {
  if (!cache[url]) {
    cache[url] = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Couldn't load ${url} (${r.status})`);
      return r.json();
    }).catch((e) => { delete cache[url]; throw e; });
  }
  return cache[url];
}

export const loadBank = () => getJSON('data/bank.json');
export const loadSigns = () => getJSON('data/signs.json');
export const loadHC = () => getJSON('data/hc.json');

// "HC 126" -> rule link, "HC Traffic signs" -> section, "GOV.UK slug" -> gov.uk page
export function refInfo(ref) {
  const m = /^HC\s+(?:rule\s+)?(H?\d+[a-z]?)\b/i.exec(ref);
  if (m) {
    const n = m[1].toUpperCase().startsWith('H') ? m[1].toUpperCase() : m[1];
    return { kind: 'rule', rule: n, label: /^H\d/.test(n) ? `Highway Code rule ${n}` : `Highway Code rule ${n}` };
  }
  const s = /^HC\s+(.+)$/i.exec(ref);
  if (s) return { kind: 'section', name: s[1].trim(), label: `Highway Code: ${s[1].trim()}` };
  const g = /^GOV\.?UK\s+(.+)$/i.exec(ref);
  if (g) {
    const slug = g[1].trim().replace(/^\//, '');
    return { kind: 'url', url: `https://www.gov.uk/${slug}`, label: `GOV.UK: ${slug.replace(/-/g, ' ')}` };
  }
  return { kind: 'text', label: ref };
}

const SECTION_ALIASES = {
  'traffic signs': 'traffic-signs',
  'road markings': 'road-markings',
  'vehicle markings': 'vehicle-markings',
  'light signals': 'light-signals-controlling-traffic',
  'light signals controlling traffic': 'light-signals-controlling-traffic',
  'signals to other road users': 'signals-to-other-road-users',
  'signals by authorised persons': 'signals-by-authorised-persons',
  'introduction': 'introduction',
  'annex 1': 'annex-1-you-and-your-bicycle',
  'annex 2': 'annex-2-motorcycle-licence-requirements',
  'annex 3': 'annex-3-motor-vehicle-documentation-and-learner-driver-requirements',
  'annex 4': 'annex-4-the-road-user-and-the-law',
  'annex 5': 'annex-5-penalties',
  'annex 6': 'annex-6-vehicle-maintenance-safety-and-security',
  'annex 7': 'annex-7-first-aid-on-the-road',
  'annex 8': 'annex-8-safety-code-for-new-drivers',
};

export function sectionSlugFor(name, hc) {
  const key = name.toLowerCase().replace(/[‘’']/g, '').trim();
  for (const [alias, slug] of Object.entries(SECTION_ALIASES)) {
    if (key === alias || key.startsWith(alias + ' ') || key.startsWith(alias + '.') || key.startsWith(alias + ':')) return slug;
  }
  if (hc) {
    const hit = hc.sections.find((s) => s.title.toLowerCase().includes(key) || s.slug.includes(key.replace(/\s+/g, '-')));
    if (hit) return hit.slug;
  }
  return null;
}
