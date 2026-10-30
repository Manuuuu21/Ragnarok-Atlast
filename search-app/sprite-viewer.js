import { parseAct, parseSpr } from '../assets/formats.js';
import { Renderer } from '../assets/renderer.js';
import { composePreview } from './sprite-preview-core.js?v=20261029-hidden-headgear';

const assetRoot = new URL('img/sprites/', import.meta.url);
const directions = ['Front', 'Front left', 'Left', 'Back left', 'Back', 'Back right', 'Right', 'Front right'];
const preferences = { gender: 'male', walking: false };
const cache = new Map();
let manifestPromise;
let nextId = 0;
function getManifest() {
  return manifestPromise ||= fetch(new URL('manifest.json', assetRoot), { cache: 'no-cache' }).then(response => {
    if (!response.ok) throw new Error('Sprite assets are unavailable.');
    return response.json();
  }).then(manifest => {
    if (manifest.version !== 1 || !manifest.characters || !manifest.headgears) throw new Error('Sprite assets are unavailable.');
    return manifest;
  }).catch(error => { manifestPromise = null; throw error; });
}
async function loadPair(path) {
  if (!/^(?:base\/(?:male|female)-(?:body|head)|headgear\/\d+-(?:male|female))(?:-[a-f0-9]{64})?$/.test(path)) throw new Error('This sprite is unavailable.');
  if (cache.has(path)) return cache.get(path);
  const pending = Promise.all(['act', 'spr'].map(async extension => {
    const response = await fetch(new URL(`${path}.${extension}`, assetRoot));
    if (!response.ok) throw new Error('This sprite is unavailable.');
    return response.arrayBuffer();
  })).then(([act, spr]) => {
    const part = { act: parseAct(act), spr: parseSpr(spr) };
    part.renderer = new Renderer(part.spr);
    return part;
  }).catch(error => { cache.delete(path); throw error; });
  cache.set(path, pending);
  if (cache.size > 20) cache.delete(cache.keys().next().value);
  return pending;
}

class HeadgearViewer extends HTMLElement {
  connectedCallback() {
    const id = `sprite-preview-${++nextId}`;
    this.direction = 0;
    this.gender = preferences.gender;
    this.walking = preferences.walking;
    this.playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.generation = 0;
    this.requested = false;
    this.innerHTML = `<h4>Item preview</h4><div class="sprite-stage"><canvas hidden role="img"></canvas><p class="sprite-status" role="status">Loading preview…</p></div><div class="sprite-settings"><label class="sr-only" for="${id}-gender">Preview character</label><select id="${id}-gender" aria-label="Preview character"><option value="male">Male</option><option value="female">Female</option></select><label class="sr-only" for="${id}-pose">Preview pose</label><select id="${id}-pose" aria-label="Preview pose"><option value="standing">Standing</option><option value="walking">Walking</option></select></div><div class="sprite-controls"><button type="button" data-turn="1" aria-label="Rotate left">↶</button><button type="button" class="sprite-play" aria-label="Pause sprite animation">Pause</button><button type="button" data-turn="-1" aria-label="Rotate right">↷</button></div><p class="sprite-direction">Front</p>`;
    this.canvas = this.querySelector('canvas');
    this.status = this.querySelector('.sprite-status');
    this.genderSelect = this.querySelector(`#${id}-gender`);
    this.poseSelect = this.querySelector(`#${id}-pose`);
    this.playButton = this.querySelector('.sprite-play');
    this.genderSelect.value = this.gender;
    this.poseSelect.value = this.walking ? 'walking' : 'standing';
    this.genderSelect.onchange = () => {
      preferences.gender = this.gender = this.genderSelect.value;
      this.load();
    };
    this.poseSelect.onchange = () => {
      preferences.walking = this.walking = this.poseSelect.value === 'walking';
      this.prepare();
    };
    this.querySelectorAll('[data-turn]').forEach(button => {
      button.onclick = () => {
        this.direction = (this.direction + Number(button.dataset.turn) + 8) % 8;
        this.prepare();
      };
    });
    this.playButton.onclick = () => {
      this.playing = !this.playing;
      this.updatePlayButton();
      this.start();
    };
    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (!this.visible) cancelAnimationFrame(this.animation);
      else if (!this.requested) { this.requested = true; this.load(); }
      else this.start();
    }, { rootMargin: '160px' });
    this.observer.observe(this);
    this.setControls(false);
  }
  disconnectedCallback() {
    this.generation++;
    this.observer?.disconnect();
    cancelAnimationFrame(this.animation);
    this.parts = this.preview = null;
  }
  setControls(enabled) {
    this.querySelectorAll('select, button').forEach(control => { control.disabled = !enabled; });
    if (enabled) this.updatePlayButton();
  }
  updatePlayButton() {
    const animated = this.preview?.frames.length > 1;
    this.playButton.disabled = !animated;
    this.playButton.textContent = animated ? this.playing ? 'Pause' : 'Play' : 'Still';
    this.playButton.setAttribute('aria-label', animated ? this.playing ? 'Pause sprite animation' : 'Play sprite animation' : 'Static sprite');
  }
  showError(message, allowGender = false) {
    cancelAnimationFrame(this.animation);
    this.preview = null;
    this.canvas.hidden = true;
    this.status.hidden = false;
    this.status.textContent = message;
    this.setControls(false);
    this.genderSelect.disabled = !allowGender;
  }
  async load() {
    const generation = ++this.generation;
    this.parts = this.preview = null;
    this.showError('Loading preview…');
    const view = Number(this.getAttribute('view-id'));
    if (!Number.isSafeInteger(view) || view <= 0) {
      this.showError('This item has no headgear sprite.');
      return;
    }
    try {
      const manifest = await getManifest();
      if (!this.isConnected || generation !== this.generation) return;
      const headgear = manifest.headgears[view]?.[this.gender];
      if (!headgear) {
        this.showError(manifest.headgears[view] ? `No ${this.gender} preview available.` : 'No sprite available for this headgear.', true);
        return;
      }
      const character = manifest.characters[this.gender];
      const parts = await Promise.all([character?.body, character?.head, headgear].map(loadPair));
      if (!this.isConnected || generation !== this.generation) return;
      this.parts = parts;
      this.prepare();
    } catch (error) {
      if (this.isConnected && generation === this.generation) this.showError(error.message, true);
    }
  }
  prepare() {
    if (!this.parts) return;
    cancelAnimationFrame(this.animation);
    try {
      this.preview = composePreview(this.parts, this.direction, this.walking);
      this.frame = 0;
      this.status.hidden = true;
      this.canvas.hidden = false;
      this.canvas.setAttribute('aria-label', `${this.gender === 'male' ? 'Male' : 'Female'} Novice wearing ${this.getAttribute('item-name') || 'headgear'}, ${directions[this.direction].toLowerCase()}, ${this.walking ? 'walking' : 'standing'}`);
      this.querySelector('.sprite-direction').textContent = directions[this.direction];
      this.setControls(true);
      this.draw();
      this.start();
    } catch (error) {
      this.showError(error.message, true);
      this.poseSelect.disabled = false;
      this.querySelectorAll('[data-turn]').forEach(button => { button.disabled = false; });
    }
  }
  draw() {
    const frame = this.preview.frames[this.frame];
    this.parts.forEach((part, index) => part.renderer.draw(this.canvas, frame[index], this.preview.bounds, null, index === 0));
  }
  start() {
    cancelAnimationFrame(this.animation);
    if (!this.isConnected || !this.visible || !this.playing || !this.preview || this.preview.frames.length < 2) return;
    let previous = performance.now();
    const tick = now => {
      if (now - previous >= this.preview.delay) {
        const elapsed = Math.floor((now - previous) / this.preview.delay);
        this.frame = (this.frame + elapsed) % this.preview.frames.length;
        previous += elapsed * this.preview.delay;
        this.draw();
      }
      this.animation = requestAnimationFrame(tick);
    };
    this.animation = requestAnimationFrame(tick);
  }
}
customElements.define('headgear-viewer', HeadgearViewer);
