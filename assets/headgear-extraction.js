import { legacyLuaText } from './lua-legacy.js';
import { parseAct, parseSpr } from './formats.js';
import { readAccessoryTable } from './accessory-tables.js';
import { readGrfEntry } from './grf-core.js?v=5';

const basePaths = new Map();
for (const [gender, sex] of [['male', '남'], ['female', '여']]) {
  basePaths.set(`${gender}-body`, legacyLuaText(`data/sprite/인간족/몸통/${sex}/초보자_${sex}`));
  basePaths.set(`${gender}-head`, legacyLuaText(`data/sprite/인간족/머리통/${sex}/1_${sex}`));
}
const accessoryPrefix = legacyLuaText('data/sprite/악세사리/');
const key = path => legacyLuaText(path).toLowerCase();

export function headgearEntry(path) {
  const name = key(path);
  return name.startsWith(accessoryPrefix.toLowerCase()) ||
    [...basePaths.values()].some(base => name.startsWith(base.toLowerCase() + '.')) ||
    /\/(?:accessoryid|accname)\.lub$/i.test(name) ? { kind: 'preview' } : null;
}

// Count mapped source pairs without loading hundreds of MB of sprite data.
// Asset bytes are not extracted until the user starts an export.
export async function planHeadgearSprites(archive, readEntry = readGrfEntry, mappingOverrides = {}) {
  const entries = new Map(archive.entries.map(entry => [key(entry.path), entry]));
  const mappings = new Map(), mappingSources = [];
  if (Boolean(mappingOverrides.accessoryid) !== Boolean(mappingOverrides.accname)) throw new Error('Supply both accessoryid and accname overrides from the same client.');
  for (const name of ['accessoryid', 'accname']) {
    const globalName = name === 'accessoryid' ? 'ACCESSORY_IDs' : 'AccNameTable';
    const override = mappingOverrides[name];
    if (override) {
      readAccessoryTable(override.bytes, globalName, mappings);
      mappingSources.push(override.path);
      continue;
    }
    const candidates = archive.entries.filter(entry => entry.path.toLowerCase().endsWith(`/${name}.lub`));
    const entry = candidates.find(entry => /\/datainfo\//i.test(entry.path)) || candidates[0];
    if (!entry) throw new Error(`The archive has no ${name}.lub.`);
    readAccessoryTable(await readEntry(archive, entry), globalName, mappings);
    mappingSources.push(entry.path);
  }
  const names = mappings.get('AccNameTable');
  if (!names?.size) throw new Error('No headgear mappings found.');
  const hasPair = base => entries.has(key(base + '.act')) && entries.has(key(base + '.spr'));
  for (const base of basePaths.values()) if (!hasPair(base)) throw new Error(`ACT/SPR pair missing: ${base}`);
  let pairs = basePaths.size;
  for (const [view, name] of names) {
    if (!Number.isSafeInteger(view) || view <= 0 || typeof name !== 'string' || /[\\/\x00-\x1f]/.test(name)) continue;
    for (const sex of ['남', '여']) if (hasPair(`${accessoryPrefix}${legacyLuaText(sex)}/${legacyLuaText(sex)}${name}`)) pairs++;
  }
  if (pairs === basePaths.size) throw new Error('No mapped headgear ACT/SPR pairs found.');
  return { entries, names, mappingSources, pairs };
}

// Extract and validate preview assets for the browser exporter.
// Destination errors must propagate; only source asset errors may be skipped.
export async function extractHeadgearSprites(archive, savePair, progress = () => {}, readEntry = readGrfEntry, sourcePlan = null) {
  const { entries, names, mappingSources } = sourcePlan || await planHeadgearSprites(archive, readEntry);
  const manifest = { version: 1, characters: {}, headgears: {}, mappingSources };
  const problems = [];
  let bytes = 0, pairs = 0, done = 0;
  async function loadPair(sourceBase) {
    const actEntry = entries.get(key(sourceBase + '.act'));
    const sprEntry = entries.get(key(sourceBase + '.spr'));
    if (!actEntry || !sprEntry) throw new Error(`ACT/SPR pair missing: ${sourceBase}`);
    const [act, spr] = await Promise.all([readEntry(archive, actEntry), readEntry(archive, sprEntry)]);
    const parsed = parseAct(act.buffer.slice(act.byteOffset, act.byteOffset + act.byteLength));
    parseSpr(spr.buffer.slice(spr.byteOffset, spr.byteOffset + spr.byteLength));
    if (parsed.actions.length < 8 || parsed.actions.slice(0, 8).some(action => !action.frames.length)) throw new Error('Missing standing directions.');
    if (act.length + spr.length > 64 * 1024 * 1024) throw new Error('Sprite pair exceeds the 64 MB limit.');
    return { act, spr };
  }
  async function save(path, pair) {
    const size = pair.act.length + pair.spr.length;
    const output = await savePair({ path, ...pair });
    bytes += size; pairs++;
    return output || path;
  }
  // Validate all four character parts before writing any preview assets.
  const bases = new Map();
  for (const [name, path] of basePaths) bases.set(name, await loadPair(path));
  for (const gender of ['male', 'female']) {
    manifest.characters[gender] = {};
    for (const part of ['body', 'head']) {
      const name = `${gender}-${part}`;
      manifest.characters[gender][part] = await save(`base/${name}`, bases.get(name));
    }
  }
  for (const [view, name] of names) {
    if (!Number.isSafeInteger(view) || view <= 0 || typeof name !== 'string' || /[\\/\x00-\x1f]/.test(name)) continue;
    const genders = {};
    for (const [gender, sex] of [['male', '남'], ['female', '여']]) {
      const sourceBase = `${accessoryPrefix}${legacyLuaText(sex)}/${legacyLuaText(sex)}${name}`;
      let pair;
      try { pair = await loadPair(sourceBase); }
      catch (error) { problems.push(`View ${view} (${gender}): ${error.message}`); continue; }
      genders[gender] = await save(`headgear/${view}-${gender}`, pair);
    }
    if (Object.keys(genders).length) manifest.headgears[view] = genders;
    progress({ done: ++done, total: names.size, pairs, headgears: Object.keys(manifest.headgears).length });
  }
  if (!Object.keys(manifest.headgears).length) throw new Error('No usable headgear sprites found.');
  return { manifest, report: { mappingSources, pairs, bytes, problems } };
}

