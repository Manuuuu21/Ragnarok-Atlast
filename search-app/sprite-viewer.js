import { parseAct, parseSpr } from './sprite-runtime/formats.js';
import { Renderer } from './sprite-runtime/renderer.js';
import { composePreview } from './sprite-preview-core.js?v=20261101-garments';
import { loadSpriteCatalog } from './sprite-assets.js?v=20261101-garments';

const directions = ['Front', 'Front left', 'Left', 'Back left', 'Back', 'Back right', 'Right', 'Front right'];
const preferences = { gender: 'male', walking: false };
const cache = new Map();
const manifests = new Map();
let nextId = 0;
function getManifest(kind) {
  if (!manifests.has(kind)) manifests.set(kind, loadSpriteCatalog(fetch, kind).catch(error => { manifests.delete(kind); throw error; }));
  return manifests.get(kind);
}
async function loadPair(path, assetRoot) {
  if (!/^(?:base\/(?:male|female)-(?:body|head)|(?:headgear|garment)\/\d+-(?:male|female))(?:-[a-f0-9]{64})?$/.test(path)) throw new Error('This sprite is unavailable.');
  const cacheKey = new URL(path, assetRoot).href;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const pending = Promise.all(['act', 'spr'].map(async extension => {
    const response = await fetch(new URL(`${path}.${extension}`, assetRoot));
    if (!response.ok) throw new Error('This sprite is unavailable.');
    return response.arrayBuffer();
  })).then(([act, spr]) => {
    const part = { act: parseAct(act), spr: parseSpr(spr) };
    part.renderer = new Renderer(part.spr);
    return part;
  }).catch(error => { cache.delete(cacheKey); throw error; });
  cache.set(cacheKey, pending);
  if (cache.size > 20) cache.delete(cache.keys().next().value);
  return pending;
}

class EquipmentViewer extends HTMLElement {
  connectedCallback() {
    const id = `sprite-preview-${++nextId}`;
    this.kind = this.localName === 'garment-viewer' ? 'garment' : 'headgear';
    this.direction = this.kind === 'garment' ? 4 : 0;
    this.gender = preferences.gender;
    this.walking = preferences.walking;
    this.playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.generation = 0;
    this.requested = false;
    this.innerHTML = `<h4>Item preview</h4><div class="sprite-stage"><canvas hidden role="img"></canvas><p class="sprite-status" role="status">Loading preview…</p></div><div class="sprite-settings"><label class="sr-only" for="${id}-gender">Preview character</label><select id="${id}-gender" aria-label="Preview character"><option value="male">Male</option><option value="female">Female</option></select><label class="sr-only" for="${id}-pose">Preview pose</label><select id="${id}-pose" aria-label="Preview pose"><option value="standing">Standing</option><option value="walking">Walking</option></select></div><div class="sprite-controls"><button type="button" data-turn="1" aria-label="Rotate left">↶</button><button type="button" class="sprite-play" aria-label="Pause sprite animation">Pause</button><button type="button" data-turn="-1" aria-label="Rotate right">↷</button></div><p class="sprite-direction">Front</p>`;
    this.canvas = this.querySelector('canvas');
    this.querySelector('h4').textContent = this.kind === 'garment' ? 'Costume garment preview' : 'Item preview';
    this.querySelector('.sprite-direction').textContent = directions[this.direction];
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
      this.showError(`This item has no ${this.kind} sprite view.`);
      return;
    }
    try {
      const { manifest, root } = await getManifest(this.kind);
      if (!this.isConnected || generation !== this.generation) return;
      const equipment = manifest[this.kind === 'garment' ? 'garments' : 'headgears'][view];
      const sprite = equipment?.[this.gender];
      if (!sprite) {
        this.showError(equipment ? `No ${this.gender} preview available.` : `No sprite available for this ${this.kind} in the extracted catalog.`, true);
        return;
      }
      const character = manifest.characters[this.gender];
      const parts = await Promise.all([character?.body, character?.head, sprite].map(path => loadPair(path, root)));
      if (!this.isConnected || generation !== this.generation) return;
      this.parts = parts;
      this.topLayer = equipment.topLayer === true;
      this.prepare();
    } catch (error) {
      if (this.isConnected && generation === this.generation) this.showError(error.message, true);
    }
  }
  prepare() {
    if (!this.parts) return;
    cancelAnimationFrame(this.animation);
    try {
      this.preview = composePreview(this.parts, this.direction, this.walking, { kind: this.kind, topLayer: this.topLayer });
      this.frame = 0;
      this.status.hidden = true;
      this.canvas.hidden = false;
      this.canvas.setAttribute('aria-label', `${this.gender === 'male' ? 'Male' : 'Female'} Novice wearing ${this.getAttribute('item-name') || this.kind}, ${directions[this.direction].toLowerCase()}, ${this.walking ? 'walking' : 'standing'}`);
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
    this.preview.order.forEach((index, position) => this.parts[index].renderer.draw(this.canvas, frame[index], this.preview.bounds, null, position === 0));
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
customElements.define('headgear-viewer', class extends EquipmentViewer {});
customElements.define('garment-viewer', class extends EquipmentViewer {});
