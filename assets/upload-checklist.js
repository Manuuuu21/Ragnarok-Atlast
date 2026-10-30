import { acceptsSourceFile, isSpawnPath, isSpawnConfig } from './monster-spawns.js?v=upload-checklist-1';
import { isMapBitmap } from './map-data.js?v=maps-4';

const groups = [
  { id: 'items', output: 'item-data.js', kinds: ['items', 'client', 'cardArt'], sources: [
    { id: 'equipment', label: 'item_db_equip.yml', pattern: /^item_db_equip\.ya?ml$/i, help: 'rAthena: db/re/ — equipment stats and scripts.' },
    { id: 'usable', label: 'item_db_usable.yml', pattern: /^item_db_usable\.ya?ml$/i, help: 'rAthena: db/re/ — consumables and usable items.' },
    { id: 'etc', label: 'item_db_etc.yml', pattern: /^item_db_etc\.ya?ml$/i, help: 'rAthena: db/re/ — materials, miscellaneous items, and cards.' },
    { id: 'itemInfo', label: 'iteminfo*.lua', pattern: /^iteminfo.*\.(?:lua|lub)$/i, help: 'Client files — item names, descriptions, and resource names. Accepts itemInfo_EN.lua, itemInfo_custom.lua, and other iteminfo*.lua filenames, regardless of capitalization. Readable .lub files are also supported.' },
    { id: 'cardArt', label: 'num2cardillustnametable.txt', pattern: /^num2cardillustnametable\.txt$/i, optional: true, help: 'Extract from data.grf for card illustration filenames.' }
  ] },
  { id: 'monsters', output: 'monster-data.js', kinds: ['monsters', 'spawns', 'spawnConfig', 'jobNames', 'npcIdentity'], sources: [
    { id: 'mobDb', label: 'mob_db.yml', pattern: /^mob_db\.ya?ml$/i, help: 'rAthena: db/re/ — monster IDs, stats, and drops.' },
    { id: 'jobNames', label: 'jobname.lub', pattern: /^jobname\.(?:lub|lua)$/i, help: 'Extract from data.grf — sprite names. Readable .lua is also accepted; decompile binary LUB first.' },
    { id: 'npcIdentity', label: 'npcidentity.lub', pattern: /^npcidentity\.(?:lub|lua)$/i, help: 'Extract from data.grf — client monster IDs. Readable .lua is also accepted; decompile binary LUB first.' },
    { id: 'spawns', label: 'npc/re/mobs/ (or mob/) — spawn TXT files', optional: true, help: 'Choose folder for spawn maps and quantities. A file count cannot confirm that the entire folder was selected.' }
  ] },
  { id: 'maps', output: 'map-data.js', kinds: ['maps'], sources: [
    { id: 'mapNames', label: 'mapnametable.txt', pattern: /^mapnametable\.txt$/i, help: 'Extract from data.grf. A map/ BMP folder or individual map BMPs can also build this table.' }
  ] }
];

// This is a selection checklist, not a claim that the files contain valid data.
// Parsed kinds identify custom filenames and individually selected spawn TXT files
// once the importer has read them (file pickers may omit folder paths).
export function inspectUploads(files, parsed = []) {
  const sources = files.filter(file => acceptsSourceFile(file)).map(file => {
    const path = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    return { path, basename: path.split('/').pop() };
  });
  const spawnPaths = new Set(sources.filter(file => isSpawnPath(file.path)).map(file => file.path));
  for (const file of parsed) if (file.kind === 'spawns' && file.entries.length) spawnPaths.add(file.name.replace(/\\/g, '/'));
  const bitmapCount = sources.filter(file => isMapBitmap(file.path)).length;
  return groups.map(group => {
    const rows = group.sources.map(source => {
      const count = source.id === 'spawns' ? spawnPaths.size : sources.filter(file => source.pattern.test(file.basename)).length;
      const alternativeCount = source.id === 'mapNames' && !count ? bitmapCount : 0;
      return { id: source.id, label: source.label, help: source.help, optional: !!source.optional, count, alternativeCount, present: count > 0 || alternativeCount > 0 };
    });
    const relatedFilename = sources.some(file => group.id === 'items'
      ? /^(?:iteminfo|item_db)/i.test(file.basename)
      : group.id === 'monsters' && (/^(?:mob|monster)_db/i.test(file.basename) || isSpawnConfig(file.path)));
    const active = rows.some(row => row.present) || relatedFilename || parsed.some(file => group.kinds.includes(file.kind));
    return { id: group.id, output: group.output, active, sources: rows, missing: rows.filter(row => !row.present) };
  });
}

export function missingUploadWarnings(checklist) {
  return checklist.filter(group => group.active).flatMap(group => {
    const warnings = [];
    const missing = group.missing.filter(source => !source.optional);
    const optional = group.missing.filter(source => source.optional);
    if (missing.length) warnings.push(`Upload checklist for ${group.output}: guide files not selected: ${missing.map(source => source.label).join(', ')}. Partial or custom builds are allowed; include these files when you need the full guide data.`);
    if (optional.length) warnings.push(`Upload checklist for ${group.output}: optional sources not selected: ${optional.map(source => source.label).join(', ')}. Add them if you need ${group.id === 'items' ? 'card illustration filenames' : 'spawn maps and quantities'}.`);
    return warnings;
  });
}
