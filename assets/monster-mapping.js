import { parseLuaTable } from './lua.js?v=monster-mapping-3';
import { legacyLuaFields } from './lua-legacy.js';

export function monsterMappingKind(filename) {
  const match = String(filename).match(/(?:^|[\\/])(npcidentity|jobname)\.(?:lua|lub)$/i);
  return match ? (match[1].toLowerCase() === 'npcidentity' ? 'npcIdentity' : 'jobNames') : null;
}

export function parseMonsterMapping(text, kind) {
  if (/^\uFEFF?\x1bLua/.test(text) || text.startsWith('\x1bLua')) throw new Error('Compiled LUB files are unsupported. Decompile npcidentity.lub and jobname.lub to text first.');
  const { items, warnings } = parseLuaTable(text, { jobKeys: kind === 'jobNames', allowDuplicates: true });
  const entries = kind === 'jobNames' ? legacyLuaFields(items) : items;
  for (const [key,value] of Object.entries(entries)) {
    if (kind === 'npcIdentity') {
      if (!/^JT_\w+$/.test(key) || !Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid NPC identity ${key}; expected JT_NAME = numeric ID.`);
    } else {
      if (!/^JT_\w+$/.test(key) && !/^\d+$/.test(key)) throw new Error(`Invalid job name key ${key}; expected jobtbl.JT_NAME or a numeric ID.`);
      // Client tables also contain relative mercenary paths such as female/archer.
      // Preserve the resource path; the GIF export uses a flat folder of basenames.
      if (typeof value !== 'string' || /[:\x00-\x1f\x7f]/.test(value) || value.split(/[\\/]/).some(part => !part.trim() || part === '.' || part === '..')) throw new Error(`Invalid sprite filename for ${key}; expected a filename or relative sprite path without empty, dot, or parent segments.`);
    }
  }
  return { kind, entries, warnings };
}

export function resolveMonsterMappings(files, warnings) {
  const identities = new Map(), names = [], resolved = new Map();
  for (const file of files) {
    if (file.kind === 'npcIdentity') for (const [key,id] of Object.entries(file.entries)) {
      if (identities.has(key)) warnings.push(`${file.name}: ${key} overrides an earlier identity.`);
      identities.set(key, { id, source: file.name });
    }
    if (file.kind === 'jobNames') names.push(file);
  }
  const unresolved = new Set();
  for (const file of names) for (const [key,spriteName] of Object.entries(file.entries)) {
    const identity = identities.get(key), id = /^\d+$/.test(key) ? Number(key) : identity?.id;
    if (!Number.isSafeInteger(id) || id < 0) { unresolved.add(key); continue; }
    if (resolved.has(id)) warnings.push(`${file.name}: sprite for client ID ${id} overrides an earlier mapping.`);
    resolved.set(id, { spriteName, sources: [...(identity ? [identity.source] : []),file.name] });
  }
  if (identities.size && !names.length) warnings.push('npcidentity supplies client IDs, not sprite filenames. Add jobname.lub to resolve monster artwork.');
  if (unresolved.size) warnings.push(`${unresolved.size} jobname keys have no NPC identity: ${[...unresolved].slice(0,10).join(', ')}. Add the matching npcidentity.lub.`);
  return resolved;
}
