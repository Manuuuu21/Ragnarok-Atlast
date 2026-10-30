import { isMapNameTable, isMapBitmap } from './map-data.js?v=maps-4';

const normalize = path => String(path).replace(/\\/g, '/');
export const isSpawnConfig = path => /(?:^|\/)scripts_monsters\.conf$/i.test(normalize(path));
export const isSpawnPath = path => /(?:(?:^|\/)mobs?\/|^(?:fields|dungeons)\/).*\.txt$/i.test(normalize(path));

export function acceptsSourceFile(file, folder = false) {
  const path = normalize(file.webkitRelativePath || file.name);
  if (/(?:^|\/)pre-re(?:\/|$)/i.test(path)) return false;
  if (isMapBitmap(path, folder)) return true;
  if (isMapNameTable(path)) return true;
  if (isSpawnConfig(path)) return true;
  if (!/\.(lua|lub|ya?ml|txt)$/i.test(file.name)) return false;
  return !folder || isSpawnPath(path) || /(?:iteminfo|item_db|mob_db|num2cardillustnametable|npcidentity|jobname)/i.test(file.name);
}

// Keep line numbers and quoted strings intact while removing script comments.
function uncomment(text) {
  return text.replace(/"(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
    token => token.startsWith('"') ? token : token.replace(/[^\r\n]/g, ' '));
}

export function parseSpawnConfig(text) {
  const entries = [], warnings = [];
  for (const line of uncomment(text).split(/\r?\n/)) {
    const match = line.trim().match(/^npc:\s*(\S+)\s*$/i);
    if (match) entries.push(normalize(match[1]));
    else if (line.trim()) warnings.push(`Unsupported spawn configuration directive: ${line.trim()}. Select the actual spawn files or a flat scripts_monsters.conf.`);
  }
  return { kind:'spawnConfig', entries, warnings };
}

export function parseMonsterSpawns(text) {
  const entries = [], warnings = [];
  let depth = 0, scripted = false;
  for (const [index, line] of uncomment(text.replace(/^\uFEFF/, '')).split(/\r?\n/).entries()) {
    const match = depth === 0 && line.trim().match(/^(\S+)\s+(boss_monster|monster)\s+(.+?)\t+([^\t]+)\s*$/);
    if (match) {
      const location = match[1].split(','), values = match[4].split(',').map(v => v.trim());
      const map = location[0], id = /^\d+$/.test(values[0]) ? Number(values[0]) : values[0], count = Number(values[1]);
      if (!/^[\w@-]+$/.test(map) || location.slice(1).some(v => !/^\d+$/.test(v)) || location.length > 5 ||
          !(typeof id === 'number' ? Number.isSafeInteger(id) && id > 0 : /^[A-Za-z_][A-Za-z_0-9]*$/.test(id)) || !/^\d+$/.test(values[1] || '') ||
          !Number.isSafeInteger(count) || count <= 0) {
        throw new Error(`Line ${index+1}: invalid static monster spawn; expected map, coordinates, monster ID and positive count.`);
      }
      const delays = [values[2], values[3]].map(value => {
        if (value === undefined || value === '') return null;
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
          throw new Error(`Line ${index+1}: invalid spawn delay; expected non-negative integer milliseconds.`);
        }
        return Number(value) / 1000;
      });
      entries.push({ id, map, count, spawnTime: { baseSeconds: delays[0], randomSeconds: delays[1] } });
    } else if (depth === 0 && /^\S+\s+(?:boss_monster|monster)\s/.test(line.trim())) {
      throw new Error(`Line ${index+1}: malformed spawn. Use tab-separated rAthena monster declarations.`);
    }
    // Script bodies can create conditional monsters or remove static spawns.
    const code = line.replace(/"(?:\\.|[^"\\])*"/g, '""');
    if (/\b(?:monster|areamonster|killmonster|killmonsterall)\s*(?:\(|")/.test(line) && !match) scripted = true;
    for (const char of code) { if (char === '{') depth++; else if (char === '}') depth = Math.max(0, depth-1); }
  }
  if (scripted) warnings.push('Script-controlled spawns or removals are not evaluated; only static monster declarations are counted.');
  if (!entries.length) warnings.push('No static monster spawns found.');
  return { kind:'spawns', entries, warnings };
}

export function attachMonsterSpawns(files, monsters, warnings) {
  const spawnFiles = files.filter(file => file.kind === 'spawns');
  const configs = files.filter(file => file.kind === 'spawnConfig');
  if (!spawnFiles.length && !configs.length) return;
  const enabled = new Set(configs.flatMap(file => file.entries));
  const matched = new Set(), unknown = new Set(), totals = new Map();
  const byName = new Map(Object.values(monsters).filter(m => m.aegisName).map(m => [m.aegisName,m.id]));
  let included = 0;
  for (const file of spawnFiles) {
    const path = normalize(file.name);
    const references = [...enabled].filter(target => path === target || path.endsWith('/'+target) || target.endsWith('/'+path));
    if (configs.length && !references.length) continue;
    if (references.length > 1) throw new Error(`${file.name}: ambiguous spawn configuration path. Use Choose folder to preserve folders.`);
    if (references.length) {
      if (matched.has(references[0])) throw new Error(`${file.name}: duplicate spawn source selected. Remove the duplicate before building.`);
      matched.add(references[0]);
    }
    included++;
    for (const { id: reference, map, count, spawnTime } of file.entries) {
      const id = typeof reference === 'number' ? reference : byName.get(reference);
      if (id === undefined || !Object.hasOwn(monsters, id)) { unknown.add(reference); continue; }
      if (!totals.has(id)) totals.set(id, new Map());
      // Different respawn schedules on the same map must retain their own counts.
      const key = JSON.stringify([map, spawnTime.baseSeconds, spawnTime.randomSeconds]);
      const maps = totals.get(id), total = (maps.get(key)?.count || 0) + count;
      if (!Number.isSafeInteger(total)) throw new Error(`Monster ${id}: spawn count exceeds safe integer limits.`);
      maps.set(key, { map, count: total, spawnTime });
      if (!monsters[id].sources.includes(file.name)) monsters[id].sources.push(file.name);
    }
  }
  for (const [id, maps] of totals) monsters[id].spawns = [...maps.values()].sort((a,b) =>
    a.map.localeCompare(b.map) || (a.spawnTime.baseSeconds ?? -1) - (b.spawnTime.baseSeconds ?? -1) ||
    (a.spawnTime.randomSeconds ?? -1) - (b.spawnTime.randomSeconds ?? -1));
  if (configs.length) {
    warnings.push(`Spawn import: used ${included} of ${spawnFiles.length} selected files listed in scripts_monsters.conf; ${spawnFiles.length-included} unlisted files excluded.`);
    const missing = [...enabled].filter(path => !matched.has(path));
    if (missing.length) warnings.push(`${missing.length} configured spawn files were not selected: ${missing.slice(0,5).join(', ')}. Counts may be incomplete.`);
  } else warnings.push(`Spawn import: used all ${included} selected spawn files. Add scripts_monsters.conf to exclude disabled files. Counts describe static declarations, not live populations.`);
  if (unknown.size) warnings.push(`${unknown.size} spawn monster IDs have no imported monster database entry: ${[...unknown].slice(0,10).join(', ')}. Add the matching mob_db.yml; incomplete monsters were not created.`);
}
