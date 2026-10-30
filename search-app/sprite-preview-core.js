import { measure } from '../assets/renderer.js';

// Standing ACT frames are grouped by three look directions, not a looping nod.
export function standingFrameCount(action) {
  return action.frames.length % 3 === 0 ? action.frames.length / 3 : action.frames.length;
}

export function anchoredLayers(frame, sourceAnchor, bodyAnchor) {
  const x = sourceAnchor && bodyAnchor ? bodyAnchor.x - sourceAnchor.x : 0;
  const y = sourceAnchor && bodyAnchor ? bodyAnchor.y - sourceAnchor.y : 0;
  return frame.map(layer => ({ ...layer, x: layer.x + x, y: layer.y + y }));
}

function isHiddenHeadgearPlaceholder(spr, layer) {
  if (layer.index < 0) return false;
  const image = spr.images[layer.index + (layer.type ? spr.indexedCount : 0)];
  // Some face accessories hide rear/side views with a 1px sprite at y=100.
  // Omit that off-character marker from both drawing and the fitted bounds.
  return layer.y >= 100 && image?.width === 1 && image.height === 1
    && Math.abs(layer.sx) <= 1 && Math.abs(layer.sy) <= 1;
}

// Parts are ordered body, head, headgear. They retain separate SPR palettes.
export function composePreview(parts, direction, walking = false) {
  if (!Number.isInteger(direction) || direction < 0 || direction > 7 || parts.length !== 3) throw new Error('Invalid character preview.');
  const actions = parts.map(part => part.act.actions[(walking ? 8 : 0) + direction]);
  if (actions.some(action => !action?.frames.length)) throw new Error('This pose is unavailable.');
  const count = walking ? actions[0].frames.length : standingFrameCount(actions[2]);
  if (!count || count > 300) throw new Error('This animation is too large to preview.');
  const frames = Array.from({ length: count }, (_, index) => {
    const bodyIndex = walking ? index : 0;
    const anchor = actions[0].anchors?.[bodyIndex]?.[0];
    return actions.map((action, part) => {
      const frameIndex = part === 0 ? bodyIndex : !walking && part === 1 ? 0 : index % action.frames.length;
      const layers = part === 2
        ? action.frames[frameIndex].filter(layer => !isHiddenHeadgearPlaceholder(parts[part].spr, layer))
        : action.frames[frameIndex];
      return part === 0 ? layers : anchoredLayers(layers, action.anchors?.[frameIndex]?.[0], anchor);
    });
  });
  const boxes = parts.flatMap((part, index) => {
    const layers = frames.map(frame => frame[index]);
    // Face accessories are often deliberately invisible from behind.
    if (!layers.some(frame => frame.some(layer => layer.index >= 0 && layer.color[3]))) return [];
    return [measure(part.spr, { frames: layers })];
  });
  if (!boxes.length) throw new Error('This pose has no visible sprite.');
  const minX = Math.min(...boxes.map(box => box.minX));
  const minY = Math.min(...boxes.map(box => box.minY));
  const width = Math.max(...boxes.map(box => box.minX + box.width)) - minX;
  const height = Math.max(...boxes.map(box => box.minY + box.height)) - minY;
  // Center every frame in the same canvas; CSS fits unusually large accessories.
  const scale = 2;
  if (width > 2048 || height > 2048 || width * height > 1000000) throw new Error('This sprite is too large to preview.');
  return { frames, bounds: { minX, minY, width: width * scale, height: height * scale, scale }, delay: Math.max(24, actions[walking ? 0 : 2].delay) };
}
