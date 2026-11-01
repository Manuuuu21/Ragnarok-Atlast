// Binary layouts: Ragnarok Research Lab's ACT/SPR documentation.
// Each read is bounded so malformed assets fail without unbounded allocations.
class Reader {
  constructor(buffer) { this.view = new DataView(buffer); this.offset = 0; }
  need(n) { if (!Number.isSafeInteger(n) || n < 0 || this.offset + n > this.view.byteLength) throw new Error('Truncated or invalid asset.'); }
  skip(n) { this.need(n); this.offset += n; }
  u8() { this.need(1); return this.view.getUint8(this.offset++); }
  u16() { this.need(2); const v = this.view.getUint16(this.offset, true); this.offset += 2; return v; }
  u32() { this.need(4); const v = this.view.getUint32(this.offset, true); this.offset += 4; return v; }
  i32() { this.need(4); const v = this.view.getInt32(this.offset, true); this.offset += 4; return v; }
  f32() { this.need(4); const v = this.view.getFloat32(this.offset, true); this.offset += 4; if (!Number.isFinite(v)) throw new Error('Invalid numeric value.'); return v; }
  bytes(n) { this.need(n); const v = new Uint8Array(this.view.buffer, this.offset, n); this.offset += n; return v; }
  header(signature) {
    if (String.fromCharCode(this.u8(), this.u8()) !== signature) throw new Error(`This is not a valid ${signature === 'SP' ? 'SPR' : 'ACT'} file.`);
    const minor = this.u8(), major = this.u8();
    return { major, minor, code: major * 10 + minor, name: `${major}.${minor}` };
  }
}
function limit(n, max, label) { if (n > max) throw new Error(`${label} exceeds the supported limit (${max}).`); return n; }

export function parseSpr(buffer) {
  limit(buffer.byteLength, 64 * 1024 * 1024, 'SPR file size');
  const r = new Reader(buffer), version = r.header('SP');
  if (![11, 20, 21].includes(version.code)) throw new Error(`SPR ${version.name} is unsupported. Supported: 1.1, 2.0, 2.1.`);
  const indexedCount = r.u16(), trueCount = version.code >= 20 ? r.u16() : 0;
  limit(indexedCount + trueCount, 10000, 'Sprite image count');
  const images = [];
  let totalPixels = 0;
  for (let i = 0; i < indexedCount + trueCount; i++) {
    const width = r.u16(), height = r.u16(), pixels = width * height;
    limit(width, 4096, 'Sprite width'); limit(height, 4096, 'Sprite height');
    totalPixels += pixels; limit(totalPixels, 16000000, 'Decoded sprite pixels');
    if (!pixels) throw new Error('Sprite image has zero dimensions.');
    const type = i < indexedCount ? 0 : 1;
    let data;
    if (!type && version.code >= 21) {
      const packed = r.bytes(r.u16());
      data = new Uint8Array(pixels);
      let out = 0;
      for (let p = 0; p < packed.length; p++) {
        const value = packed[p];
        if (value) { if (out >= pixels) throw new Error('SPR RLE overflows its image.'); data[out++] = value; }
        else {
          if (++p >= packed.length) throw new Error('Truncated SPR RLE run.');
          // Legacy decoders interpret 00 00 as two transparent pixels.
          out += packed[p] || 2;
          if (out > pixels) throw new Error('SPR RLE overflows its image.');
        }
      }
      if (out !== pixels) throw new Error('SPR RLE does not fill its image.');
    } else data = r.bytes(pixels * (type ? 4 : 1));
    images.push({ width, height, type, data });
  }
  let palette = null;
  if (indexedCount || r.view.byteLength - r.offset >= 1024) palette = r.bytes(1024);
  if (r.offset !== r.view.byteLength) throw new Error('Unexpected bytes at the end of SPR.');
  return { version: version.name, indexedCount, images, palette };
}

export function parseAct(buffer) {
  limit(buffer.byteLength, 64 * 1024 * 1024, 'ACT file size');
  const r = new Reader(buffer), version = r.header('AC'), v = version.code;
  if (![11, 20, 21, 22, 23, 24, 25].includes(v)) throw new Error(`ACT ${version.name} is unsupported. Supported: 1.1 and 2.0–2.5.`);
  const count = limit(r.u16(), 1000, 'Action count'); r.skip(10);
  const actions = [];
  let totalLayers = 0, totalFrames = 0, totalAnchors = 0;
  for (let a = 0; a < count; a++) {
    const frameCount = limit(r.u32(), 10000, 'Frames per action');
    totalFrames += frameCount; limit(totalFrames, 50000, 'Total frames');
    const frames = [], anchors = [];
    for (let f = 0; f < frameCount; f++) {
      r.skip(32);
      const layerCount = limit(r.u32(), 1000, 'Layers per frame');
      totalLayers += layerCount; limit(totalLayers, 500000, 'Total layers');
      const layers = [];
      for (let l = 0; l < layerCount; l++) {
        const layer = { x: r.i32(), y: r.i32(), index: r.i32(), mirror: r.i32() !== 0, color: [255,255,255,255], sx: 1, sy: 1, rotation: 0, type: 0 };
        if (v >= 20) {
          layer.color = Array.from(r.bytes(4));
          layer.sx = r.f32(); layer.sy = v >= 24 ? r.f32() : layer.sx;
          layer.rotation = r.i32(); layer.type = r.i32();
          if (v >= 25) { layer.width = r.i32(); layer.height = r.i32(); }
        }
        if (Math.abs(layer.sx) > 100 || Math.abs(layer.sy) > 100) throw new Error('Layer scale is too large.');
        layers.push(layer);
      }
      if (v >= 20) r.skip(4); // Audio event; GIFs have no audio.
      const frameAnchors = [];
      if (v >= 23) {
        const anchorCount = limit(r.u32(), 1000, 'Anchor count');
        totalAnchors += anchorCount; limit(totalAnchors, 500000, 'Total anchors');
        for (let i = 0; i < anchorCount; i++) {
          r.skip(4);
          frameAnchors.push({ x: r.i32(), y: r.i32(), attribute: r.i32() });
        }
      }
      anchors.push(frameAnchors);
      frames.push(layers);
    }
    actions.push({ frames, anchors, delay: 150 });
  }
  if (v >= 21) r.skip(limit(r.u32(), 10000, 'Sound count') * 40);
  if (v >= 22) for (const action of actions) {
    const ticks = r.f32();
    if (ticks <= 0 || ticks * 24 > 655350) throw new Error('Invalid ACT frame duration.');
    action.delay = ticks * 24;
  }
  if (r.offset !== r.view.byteLength) throw new Error('Unexpected bytes at the end of ACT.');
  return { version: version.name, actions };
}

export function rgbaImage(spr, image) {
  const { width, height, type, data } = image, rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const out = (y * width + x) * 4;
    if (type) {
      const src = ((height - 1 - y) * width + x) * 4;
      rgba[out] = data[src + 3]; rgba[out + 1] = data[src + 2]; rgba[out + 2] = data[src + 1]; rgba[out + 3] = data[src];
    } else {
      const index = data[y * width + x], src = index * 4;
      rgba[out] = spr.palette[src]; rgba[out + 1] = spr.palette[src + 1]; rgba[out + 2] = spr.palette[src + 2]; rgba[out + 3] = index ? 255 : 0;
    }
  }
  return rgba;
}

export function pairFiles(files) {
  const groups = new Map();
  let ignored = 0;
  for (const file of files) {
    const path = (file.webkitRelativePath || file.name).replaceAll('\\', '/');
    const match = path.match(/^(.*)\.(act|spr)$/i);
    if (!match) { ignored++; continue; }
    const key = match[1].toLowerCase(), ext = match[2].toLowerCase();
    if (!groups.has(key)) groups.set(key, { key, path: match[1], name: match[1].split('/').pop(), duplicates: false });
    const group = groups.get(key);
    if (group[ext]) group.duplicates = true;
    group[ext] = file;
  }
  const pairs = [], problems = [];
  for (const group of groups.values()) {
    if (group.duplicates) problems.push(`${group.path}: duplicate ACT or SPR filename.`);
    else if (!group.act || !group.spr) problems.push(`${group.path}: missing .${group.act ? 'spr' : 'act'}.`);
    else pairs.push(group);
  }
  pairs.sort((a,b) => a.path.localeCompare(b.path));
  return { pairs, problems, ignored };
}
