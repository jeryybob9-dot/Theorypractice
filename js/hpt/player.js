// Renders a hazard clip and collects taps. One WebGL renderer is shared by every clip (iOS limits contexts).
import * as THREE from '../../vendor/three.module.min.js';
import { buildWorld } from './world.js';
import { store } from '../store.js';

let RENDERER = null;

function renderer() {
  if (RENDERER) return RENDERER;
  const q = store.settings().quality;
  const canvas = document.createElement('canvas');
  let r;
  try {
    r = new THREE.WebGLRenderer({ canvas, antialias: q !== 'low', powerPreference: 'high-performance', preserveDrawingBuffer: false });
  } catch (e) {
    throw new Error("Your browser couldn't start 3D graphics (WebGL), which the hazard clips need.");
  }
  const dpr = window.devicePixelRatio || 1;
  r.setPixelRatio(Math.min(dpr, q === 'high' ? 2 : q === 'low' ? 1 : 1.5));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = q !== 'low';
  r.shadowMap.type = THREE.PCFShadowMap;
  RENDERER = r;
  return r;
}

export class ClipPlayer {
  // mode: 'test' (taps recorded, no pausing), 'review' (scrub/pause), 'video' (case study: plays, replays)
  constructor(frame, { mode = 'test', onEnd, onTick, onTap } = {}) {
    this.frame = frame;
    this.mode = mode;
    this.onEnd = onEnd;
    this.onTick = onTick;
    this.onTap = onTap;
    this.t = 0;
    this.playing = false;
    this.clicks = [];
    this.world = null;
    this.raf = 0;
    this.r = renderer();
    frame.appendChild(this.r.domElement);
    this.r.domElement.style.touchAction = 'manipulation';
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);
    this.resize();
  }

  resize() {
    const rect = this.frame.getBoundingClientRect();
    const w = Math.max(160, Math.round(rect.width));
    const h = Math.max(90, Math.round(rect.height || (w * 9) / 16));
    this.r.setSize(w, h, false);
    this.r.domElement.style.width = '100%';
    this.r.domElement.style.height = '100%';
    if (this.world) { this.world.camera.aspect = w / h; this.world.camera.updateProjectionMatrix(); }
    if (!this.playing && this.world) this.render();
  }

  async load(clip) {
    this.dispose(false);
    this.clip = clip;
    // let the UI paint "Loading…" before the heavy build
    await new Promise((res) => setTimeout(res, 30));
    const q = store.settings().quality;
    this.world = buildWorld(clip, { quality: q });
    this.r.shadowMap.enabled = this.world.shadows;
    this.resize();
    this.t = 0;
    this.clicks = [];
    this.world.update(0);
    try { this.r.compile(this.world.scene, this.world.camera); } catch (e) { /* older three */ }
    this.render();
  }

  render() {
    if (!this.world) return;
    this.r.render(this.world.scene, this.world.camera);
  }

  seek(t) {
    this.t = Math.max(0, Math.min(this.clip.duration, t));
    this.world.update(this.t);
    this.render();
    this.onTick && this.onTick(this.t);
  }

  play() {
    if (!this.world || this.playing) return;
    if (this.t >= this.clip.duration - 0.05) this.t = 0;
    this.playing = true;
    let last = performance.now();
    const step = (now) => {
      if (!this.playing) return;
      const dt = Math.min(0.1, (now - last) / 1000) * (window.__hptSpeed || 1); // speed hook for automated tests
      last = now;
      this.t += dt;
      if (this.t >= this.clip.duration) {
        this.t = this.clip.duration;
        this.world.update(this.t);
        this.render();
        this.playing = false;
        this.onTick && this.onTick(this.t);
        this.onEnd && this.onEnd(this.clicks.slice());
        return;
      }
      this.world.update(this.t);
      this.render();
      this.onTick && this.onTick(this.t);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
    // If the app is hidden mid-clip, keep the clock honest (the real test doesn't pause).
    this._vis = () => { if (!document.hidden) last = performance.now() - 16; };
    document.addEventListener('visibilitychange', this._vis);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    if (this._vis) document.removeEventListener('visibilitychange', this._vis);
  }

  tap() {
    if (!this.playing || this.mode !== 'test') return null;
    const t = +this.t.toFixed(3);
    this.clicks.push(t);
    this.onTap && this.onTap(t);
    return t;
  }

  dispose(full = true) {
    this.pause();
    if (this.world) { this.world.dispose(); this.world = null; }
    if (full) {
      window.removeEventListener('resize', this.resize);
      window.removeEventListener('orientationchange', this.resize);
      if (this.r.domElement.parentNode === this.frame) this.frame.removeChild(this.r.domElement);
      this.r.renderLists.dispose();
    }
  }
}
