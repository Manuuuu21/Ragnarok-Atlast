import { legacyLuaText } from './lua-legacy.js';
import { parseLuaTable } from './lua.js?v=garments-1';
import { readAccessoryLub } from './accessory-lub.js?v=garments-1';
import { readGrfEntry } from './grf-core.js?v=5';

const tables = ['SPRITE_ROBE_IDs', 'RobeNameTable', 'RobeNameTable_Eng', 'RobeTopLayer'];
const prefix = legacyLuaText('data/sprite/로브/');
const key = path => legacyLuaText(path).toLowerCase();
const noviceFiles = ['남', '여'].flatMap(sex => ['act', 'spr'].map(extension => key(`/${sex}/초보자_${sex}.${extension}`)));

export function garmentEntry(path) {
  const name = key(path);
  const relative = name.slice(prefix.length).split('/');
  return (name.startsWith(prefix.toLowerCase()) && (relative.length === 2 && name.endsWith('.spr')
    || noviceFiles.some(file => name.endsWith(file)))
    || /\/spriterobe(?:id|name)\.(?:lub|lua)$/i.test(name)) ? { kind: 'preview' } : null;
}

export function readGarmentTables(bytes, globals = new Map()) {
  if (bytes.length > 8 * 1024 * 1024) throw new Error('Garment mapping table is too large.');
  if (bytes[0] === 27) readAccessoryLub(bytes, globals, { allowedGlobals: tables, allowLists: true });
  else {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { text = new TextDecoder('windows-1252').decode(bytes); }
    while (text.trim()) {
      const name = text.replace(/^\uFEFF/, '').replace(/^(?:\s|--[^\n]*(?:\n|$))*/, '').match(/^([a-zA-Z_]\w*)\s*=/)?.[1];
      if (!tables.includes(name)) throw new Error('Expected a garment mapping table assignment.');
      const { items, remaining } = parseLuaTable(text, { expectedGlobal: name, keyTables: globals, allowList: true, remainingText: true });
      globals.set(name, new Map(Object.entries(items).map(([key, value], index) => [name === 'SPRITE_ROBE_IDs' ? key : Array.isArray(items) ? index + 1 : Number(key), value])));
      text = remaining;
    }
  }
  for (const [name, values] of globals) {
    if (!tables.includes(name)) throw new Error('Unexpected garment mapping table.');
    for (const [id, value] of values) {
      if (name === 'SPRITE_ROBE_IDs') {
        if (typeof id !== 'string' || !/^\w+$/.test(id) || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid garment ID.');
      } else if (name === 'RobeTopLayer') {
        if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid garment layer ID.');
      } else {
        if (!Number.isSafeInteger(id) || id < 0 || typeof value !== 'string' || /[\\/\x00-\x1f]/.test(value)) throw new Error('Invalid garment resource name.');
        values.set(id, legacyLuaText(value));
      }
    }
  }
  return globals;
}

export async function planGarmentSprites(archive, readEntry = readGrfEntry) {
  const entries = new Map(archive.entries.map(entry => [key(entry.path), entry]));
  const globals = new Map(), mappingSources = [], problems = [], pairs = [];
  for (const name of ['spriterobeid', 'spriterobename']) {
    const candidates = archive.entries.filter(entry => new RegExp(`/${name}\\.(?:lub|lua)$`, 'i').test(entry.path));
    const entry = candidates.find(entry => /\/datainfo\//i.test(entry.path) && /\.lub$/i.test(entry.path)) || candidates[0];
    if (!entry) throw new Error(`The archive has no ${name}.lub.`);
    readGarmentTables(await readEntry(archive, entry), globals);
    mappingSources.push(entry.path);
  }
  const names = globals.get('RobeNameTable');
  if (!names?.size) throw new Error('No garment mappings found.');
  const topLayers = new Set(globals.get('RobeTopLayer')?.values());
  for (const [view, name] of names) {
    if (view <= 0 || !name) continue;
    for (const [gender, sex] of [['male', '남'], ['female', '여']]) {
      let pair;
      for (const resource of new Set([name, globals.get('RobeNameTable_Eng')?.get(view)].filter(Boolean))) {
        const base = `${prefix}${resource}/${legacyLuaText(`${sex}/초보자_${sex}`)}`;
        const act = entries.get(key(base + '.act'));
        const spr = entries.get(key(base + '.spr')) || entries.get(key(`${prefix}${resource}/${resource}.spr`));
        if (act && spr) { pair = { view, gender, act, spr, topLayer: topLayers.has(view) }; break; }
      }
      if (pair) pairs.push(pair);
      else problems.push(`Garment view ${view} (${gender}): Novice ACT/SPR pair missing.`);
    }
  }
  if (!pairs.length) throw new Error('No mapped garment ACT/SPR pairs found.');
  return { pairs, mappingSources, problems };
}
