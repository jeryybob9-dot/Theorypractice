// Hazard perception scoring, following the DVSA format:
// - each developing hazard has a scoring window split into 5 equal parts: 5, 4, 3, 2, 1 points
// - the first response inside the window counts; responses outside it score nothing but aren't penalised
// - responding continuously or in a pattern scores 0 for the whole clip
// DVSA don't publish their exact pattern rules, so the thresholds below are a deliberately cautious
// approximation of "clicking continuously or in a pattern".

export const BAND_COLOURS = ['#00703c', '#5a9e2f', '#c9a227', '#e07a1f', '#d4351c'];

export function detectPattern(clicks) {
  const c = clicks.slice().sort((a, b) => a - b);
  if (c.length > 15) return 'You responded too many times during this clip.';
  for (let i = 0; i + 4 < c.length; i++) {
    if (c[i + 4] - c[i] <= 3.0) return 'You responded continuously (5 or more times in 3 seconds).';
  }
  if (c.length >= 6) {
    const gaps = [];
    for (let i = 1; i < c.length; i++) gaps.push(c[i] - c[i - 1]);
    for (let i = 0; i + 4 < gaps.length; i++) {
      const g = gaps.slice(i, i + 5);
      const mean = g.reduce((a, b) => a + b, 0) / g.length;
      const sd = Math.sqrt(g.reduce((a, b) => a + (b - mean) ** 2, 0) / g.length);
      if (mean < 6 && sd / mean < 0.18) return 'You responded in a regular pattern.';
    }
  }
  return null;
}

export function scoreHazard(h, clicks) {
  const w = (h.end - h.start) / 5;
  const hit = clicks.filter((t) => t >= h.start && t <= h.end).sort((a, b) => a - b)[0];
  if (hit == null) return { score: 0, click: null };
  const band = Math.min(4, Math.floor((hit - h.start) / w));
  return { score: 5 - band, click: hit };
}

export function scoreClip(hazards, clicks) {
  const pattern = detectPattern(clicks);
  const per = hazards.map((h) => scoreHazard(h, clicks));
  return {
    pattern,
    scores: per.map((p) => (pattern ? 0 : p.score)),
    rawScores: per.map((p) => p.score),
    hits: per.map((p) => p.click),
  };
}
