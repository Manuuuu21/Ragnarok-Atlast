import { openAsBlob } from 'node:fs';
import { mkdir, readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { openGrf, readGrfEntry } from '../assets/grf-core.js';
import { headgearEntry, planHeadgearSprites, extractHeadgearSprites } from '../assets/headgear-extraction.js';
import { legacyLuaText } from '../assets/lua-legacy.js';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'accessory-id': { type: 'string' }, 'acc-name': { type: 'string' }, overlay: { type: 'string', multiple: true } } });
const [source] = positionals;
if (!source || positionals.length !== 1) throw new Error('Usage: node tools/prepare-headgear-sprites.mjs path/to/data.grf [--overlay path/to/patch.grf ...] [--accessory-id path/to/accessoryid.lub --acc-name path/to/accname.lub]');
if (Boolean(values['accessory-id']) !== Boolean(values['acc-name'])) throw new Error('Supply both --accessory-id and --acc-name from the same client.');
const overrides = {};
for (const [name, option] of [['accessoryid', 'accessory-id'], ['accname', 'acc-name']]) {
  if (values[option]) {
    const path = resolve(values[option]);
    overrides[name] = { path, bytes: await readFile(path) };
  }
}
const destination = fileURLToPath(new URL('../search-app/img/sprites/', import.meta.url));
console.log('Reading the GRF index and accessory mappings…');
const sourceArchives = [source, ...(values.overlay || [])].map(path => resolve(path));
const entries = new Map();
for (const path of sourceArchives) {
  const sourceArchive = await openGrf(await openAsBlob(path), 'windows-1252', headgearEntry);
  // Later overlays have higher priority, matching the client's patch order.
  for (const entry of sourceArchive.entries) entries.set(legacyLuaText(entry.path).toLowerCase(), { ...entry, sourceArchive });
}
const archive = { entries: [...entries.values()] };
const readEntry = (_, entry) => readGrfEntry(entry.sourceArchive, entry);
const plan = await planHeadgearSprites(archive, readEntry, overrides);
console.log(`${plan.names.size} headgear mappings; ${plan.pairs} source pairs available.`);
await mkdir(join(destination, 'base'), { recursive: true });
await mkdir(join(destination, 'headgear'), { recursive: true });
const revision = new Date().toISOString().replace(/[:.]/g, '-');
for (const name of ['manifest.json', 'extraction-report.json']) {
  try { await copyFile(join(destination, name), join(destination, `${name}.${revision}.bak`)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const { manifest, report } = await extractHeadgearSprites(archive, async pair => {
  // Reuse unchanged assets. Changed mappings get new URLs, so browser caches
  // and the previous catalog keep referring to the correct sprite bytes.
  try {
    const [act, spr] = await Promise.all(['act', 'spr'].map(ext => readFile(join(destination, pair.path + '.' + ext))));
    if (act.equals(pair.act) && spr.equals(pair.spr)) return pair.path;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const hash = createHash('sha256').update(pair.act).update(pair.spr).digest('hex');
  const path = `${pair.path}-${hash}`;
  await writeFile(join(destination, path + '.act'), pair.act);
  await writeFile(join(destination, path + '.spr'), pair.spr);
  return path;
}, ({ done, total }) => { if (done % 250 === 0) console.log(`${done}/${total} headgear mappings prepared…`); }, readEntry, plan);
manifest.generatedAt = report.generatedAt = new Date().toISOString();
manifest.sourceArchives = report.sourceArchives = sourceArchives;
for (const [name, value] of [['extraction-report.json', report], ['manifest.json', manifest]]) {
  const staged = join(destination, `${name}.${revision}.tmp`);
  await writeFile(staged, JSON.stringify(value, null, name === 'manifest.json' ? 0 : 2));
  await rename(staged, join(destination, name));
}
console.log(JSON.stringify({ headgears: Object.keys(manifest.headgears).length, pairs: report.pairs, megabytes: Math.round(report.bytes / 1048576), issues: report.problems.length, destination }));
