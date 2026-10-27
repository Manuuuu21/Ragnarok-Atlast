import { rgbaImage } from './formats.js';
import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.js';

function canvas(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  c.width = w; c.height = h; return c;
}
function spriteFor(spr, layer) {
  if (layer.index < 0) return null;
  if (layer.type !== 0 && layer.type !== 1) throw new Error(`Unsupported sprite layer type ${layer.type}.`);
  const index = layer.index + (layer.type ? spr.indexedCount : 0), image = spr.images[index];
  if (!image || image.type !== layer.type) throw new Error(`ACT references missing sprite image ${layer.index} (type ${layer.type}).`);
  return image;
}
function matrix(layer) {
  const r = layer.rotation * Math.PI / 180, sx = layer.sx * (layer.mirror ? -1 : 1);
  return [Math.cos(r)*sx, Math.sin(r)*sx, -Math.sin(r)*layer.sy, Math.cos(r)*layer.sy];
}
export function measure(spr, action, scale = 1) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const frame of action.frames) for (const layer of frame) {
    const image = spriteFor(spr, layer);
    if (!image || !layer.color[3]) continue;
    const [a,b,c,d] = matrix(layer), left = -Math.floor(image.width/2), top = -Math.floor(image.height/2);
    for (const x of [left, left+image.width]) for (const y of [top, top+image.height]) {
      const px = layer.x + a*x + c*y, py = layer.y + b*x + d*y;
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    }
  }
  if (!Number.isFinite(minX)) throw new Error('This action contains no visible sprite layers.');
  minX = Math.floor(minX)-2; minY = Math.floor(minY)-2;
  const width = (Math.ceil(maxX)+2-minX)*scale, height = (Math.ceil(maxY)+2-minY)*scale;
  if (width > 4096 || height > 4096 || width*height > 4000000) throw new Error('Animation canvas is too large. Try a smaller export scale.');
  return { minX, minY, width, height, scale };
}
export class Renderer {
  constructor(spr) { this.spr = spr; this.cache = new Map(); this.cachePixels = 0; }
  layerImage(layer) {
    const image = spriteFor(this.spr, layer);
    if (!image) return null;
    const key = `${layer.type}:${layer.index}:${layer.color.join(',')}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const data = rgbaImage(this.spr, image);
    for (let p = 0; p < data.length; p += 4) for (let c = 0; c < 4; c++) data[p+c] = Math.round(data[p+c] * layer.color[c]/255);
    const result = canvas(image.width, image.height);
    result.getContext('2d').putImageData(new ImageData(data, image.width, image.height),0,0);
    if (this.cachePixels + image.width*image.height > 16000000) { this.cache.clear(); this.cachePixels = 0; }
    this.cache.set(key,result); this.cachePixels += image.width*image.height;
    return result;
  }
  draw(target, frame, bounds, background = null) {
    if (target.width !== bounds.width) target.width = bounds.width;
    if (target.height !== bounds.height) target.height = bounds.height;
    const ctx = target.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,target.width,target.height);
    if (background) { ctx.fillStyle = background; ctx.fillRect(0,0,target.width,target.height); }
    ctx.imageSmoothingEnabled = false;
    for (const layer of frame) {
      if (!layer.color[3]) continue;
      const image = this.layerImage(layer);
      if (!image) continue;
      const [a,b,c,d] = matrix(layer), s = bounds.scale;
      ctx.setTransform(a*s,b*s,c*s,d*s,(layer.x-bounds.minX)*s,(layer.y-bounds.minY)*s);
      ctx.drawImage(image,-Math.floor(image.width/2),-Math.floor(image.height/2));
    }
    ctx.setTransform(1,0,0,1,0,0);
    return ctx;
  }
}

export async function encodeGif(spr, action, options, onProgress = () => {}, isCancelled = () => false) {
  if (!action?.frames.length) throw new Error('This action has no frames.');
  const bounds = measure(spr,action,options.scale), surface = canvas(bounds.width,bounds.height), renderer = new Renderer(spr);
  if (bounds.width*bounds.height*action.frames.length > 150000000) throw new Error('This animation exceeds the export pixel budget. Reduce the scale.');
  const gif = GIFEncoder(), delay = Math.max(20, Math.round(action.delay/options.speed/10)*10);
  for (let f = 0; f < action.frames.length; f++) {
    if (isCancelled()) throw new Error('Export cancelled.');
    const ctx = renderer.draw(surface,action.frames[f],bounds,options.background);
    const rgba = ctx.getImageData(0,0,bounds.width,bounds.height).data;
    // Reserve index zero for transparency. Always use the same index across frames.
    const colors = quantize(rgba,255,{ format:'rgb565' });
    const indices = applyPalette(rgba,colors,'rgb565');
    for (let p = 0; p < indices.length; p++) indices[p] = rgba[p*4+3] < 128 ? 0 : indices[p]+1;
    const palette = [[0,0,0], ...colors];
    gif.writeFrame(indices,bounds.width,bounds.height,{ palette, delay, transparent:!options.background, transparentIndex:0, dispose:2, repeat:0 });
    onProgress(f+1,action.frames.length);
    await new Promise(resolve => setTimeout(resolve,0));
  }
  gif.finish();
  return { bytes:gif.bytes(), width:bounds.width, height:bounds.height, frames:action.frames.length, delay };
}
