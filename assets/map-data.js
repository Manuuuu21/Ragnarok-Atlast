export const isMapNameTable = filename => /(?:^|[\\/])mapnametable\.txt$/i.test(filename);
export function isMapBitmap(filename, folder = false) {
  const path = String(filename).replace(/\\/g, '/');
  return /\.bmp$/i.test(path) && (!folder || /(?:^|\/)map\//i.test(path));
}

// Only index the filename; BMP contents are not read, decoded, or embedded.
export function parseMapBitmap(filename) {
  const parts = String(filename).replace(/\\/g, '/').split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[:\x00-\x1f\x7f]/.test(part))) {
    throw new Error('Map bitmaps require a relative path without parent-directory segments.');
  }
  const match = parts.at(-1).match(/^([\w@-]+)\.bmp$/i);
  if (!match) throw new Error('Expected a map bitmap named <mapcode>.bmp.');
  const id = match[1].toLowerCase();
  if (['__proto__', 'prototype', 'constructor'].includes(id)) throw new Error(`Invalid map code ${id}.`);
  const root = parts.findIndex(part => part.toLowerCase() === 'map');
  const image = parts.slice(root < 0 ? 0 : root + 1).join('/');
  return { kind: 'maps', entries: [{ id, name: id, image }], warnings: [] };
}

// Client records are map.rsw#display name#. Export the map code as name;
// localized display labels are intentionally omitted from the generated data.
export function parseMapNames(text) {
  const entries = [], warnings = [];
  for (const [index, line] of text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    if (!line.trim() || line.trimStart().startsWith('//')) continue;
    const match = line.match(/^\s*([\w@-]+\.rsw)\s*#([^#\r\n]*)#\s*(?:\/\/.*)?$/i);
    if (!match) throw new Error(`Line ${index+1}: invalid map name entry; expected map.rsw#Display name#.`);
    const rsw = match[1], id = rsw.slice(0, -4).toLowerCase();
    if (['__proto__', 'prototype', 'constructor'].includes(id)) throw new Error(`Line ${index+1}: invalid map code ${id}.`);
    entries.push({ id, name: id, rsw });
  }
  if (!entries.length) warnings.push('No map names found.');
  return { kind: 'maps', entries, warnings };
}

export function buildMapTable(parsed, warnings) {
  const maps = new Map();
  for (const file of parsed.filter(file => file.kind === 'maps')) {
    for (const entry of file.entries) {
      const previous = maps.get(entry.id);
      if (previous && ['rsw', 'image'].some(key => Object.hasOwn(previous, key) && Object.hasOwn(entry, key))) {
        warnings.push(`${file.name}: map ${entry.id} overrides an earlier map entry.`);
      }
      maps.set(entry.id, { ...previous, ...entry, sources: [...new Set([...(previous?.sources || []), file.name])] });
    }
  }
  return Object.fromEntries([...maps].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
