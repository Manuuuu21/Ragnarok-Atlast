import { load, JSON_SCHEMA } from './vendor/js-yaml.js';
import { parseItemInfo } from './lua.js?v=monster-mapping-3';
import { legacyLuaFields } from './lua-legacy.js';
import { monsterMappingKind, parseMonsterMapping, resolveMonsterMappings } from './monster-mapping.js?v=monster-mapping-3';
import { isSpawnConfig, parseSpawnConfig, parseMonsterSpawns, attachMonsterSpawns } from './monster-spawns.js?v=maps-4';
import { isMapNameTable, parseMapNames, buildMapTable } from './map-data.js?v=maps-4';

const dangerous = new Set(['__proto__','prototype','constructor']);
export const isCardIllustrationTable = filename => /(?:^|[\\/])num2cardillustnametable\.txt$/i.test(filename);
function clean(value, seen = new Set(), depth = 0, budget = { n:0 }) {
  if (++budget.n > 2000000 || depth > 40) throw new Error('Data exceeds structural limits.');
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite number in data.');
    return value;
  }
  if (seen.has(value)) throw new Error('Repeated YAML aliases are unsupported; expand aliases before import.');
  seen.add(value);
  const out = Array.isArray(value) ? [] : Object.create(null);
  for (const [key,child] of Object.entries(value)) {
    if (dangerous.has(key)) throw new Error(`Unsupported key: ${key}`);
    out[key] = clean(child,seen,depth+1,budget);
  }
  return out;
}
export function parseDatabase(text, filename) {
  if (isMapNameTable(filename)) return parseMapNames(text);
  if (isSpawnConfig(filename)) return parseSpawnConfig(text);
  const mappingKind = monsterMappingKind(filename);
  if (mappingKind) return parseMonsterMapping(text, mappingKind);
  if (isCardIllustrationTable(filename)) return parseCardIllustrations(text);
  if (/\.(lua|lub)$/i.test(filename)) {
    if (/^\x1bLua/.test(text)) throw new Error('Compiled LUB files are unsupported. Use a text iteminfo.lua file.');
    const result = parseItemInfo(text);
    return { kind:'client', entries:legacyLuaFields(result.items), warnings:result.warnings };
  }
  if (/\.txt$/i.test(filename)) return /(?:item|mob|monster)_db/i.test(filename) ? parseLegacy(text,filename) : parseMonsterSpawns(text);
  const warnings = [];
  let loaded;
  try {
    loaded=load(text,{schema:JSON_SCHEMA});
  } catch(error) {
    if(error?.reason!=='duplicated mapping key')throw error;
    // Retry only this recoverable error. json mode keeps the last occurrence
    // without relaxing other YAML syntax, schema, or our validation checks.
    loaded=load(text,{schema:JSON_SCHEMA,json:true});
    const location=error.mark ? ` (first at line ${error.mark.line+1}, column ${error.mark.column+1})` : '';
    warnings.push(`Repeated YAML mapping keys${location}. The last value of each repeated key was kept; review conflicting values in the source file.`);
  }
  const doc = clean(loaded);
  const type = doc?.Header?.Type;
  if (type !== 'ITEM_DB' && type !== 'MOB_DB') throw new Error(`Expected ITEM_DB or MOB_DB YAML header; found ${type || 'none'}.`);
  const entries = doc.Body ?? [];
  if (!Array.isArray(entries)) throw new Error('YAML Body must be a list.');
  if (doc.Footer?.Imports?.length) warnings.push('This file references other files. Select those files too; imports are not read automatically.');
  if (!entries.length) warnings.push('No entries in Body (this may be a database include file).');
  for (const entry of entries) {
    if (!entry || !Number.isSafeInteger(entry.Id) || entry.Id <= 0) throw new Error('Every entry must have a positive integer Id.');
    for (const key of ['Name','AegisName','Script','EquipScript','UnEquipScript']) if(entry[key] !== undefined && typeof entry[key] !== 'string') throw new Error(`ID ${entry.Id}: ${key} must be text.`);
    for (const key of ['Drops','MvpDrops']) if(entry[key] !== undefined) {
      if(!Array.isArray(entry[key])) throw new Error(`ID ${entry.Id}: ${key} must be a list.`);
      for(const drop of entry[key]) if(!drop || !['string','number'].includes(typeof drop.Item) || (drop.Rate !== undefined && !Number.isFinite(drop.Rate))) throw new Error(`ID ${entry.Id}: invalid ${key} entry.`);
    }
  }
  return { kind:type === 'ITEM_DB' ? 'items' : 'monsters', entries, warnings };
}
function parseCardIllustrations(text) {
  // The client table is a sequence of itemID#bitmapBasename# records.
  const source=text.replace(/^\uFEFF/,'').replace(/\/\/[^\r\n]*/g,''),entries=Object.create(null),warnings=[];
  const record=/\s*(\d+)\s*#([^#]*)#/y;
  let offset=0;
  while(offset<source.length) {
    record.lastIndex=offset;
    const match=record.exec(source);
    if(!match) {
      if(!source.slice(offset).trim())break;
      const line=source.slice(0,offset).split('\n').length;
      throw new Error(`Invalid card illustration mapping near line ${line}; expected item_id#filename#.`);
    }
    offset=record.lastIndex;
    const id=Number(match[1]),name=match[2].trim();
    if(!Number.isSafeInteger(id) || id<=0)throw new Error('Card illustration mappings require positive integer item IDs.');
    if(!name){warnings.push(`Card ${id}: empty illustration filename skipped.`);continue;}
    if(/[\\/\x00-\x1f\x7f]/.test(name) || name==='.' || name==='..')throw new Error(`Card ${id}: expected a bitmap filename without a folder path.`);
    if(Object.hasOwn(entries,id))warnings.push(`Card ${id}: later illustration mapping overrides the earlier filename.`);
    entries[id]=/\.bmp$/i.test(name)?name:`${name}.bmp`;
  }
  return {kind:'cardArt',entries,warnings};
}
function splitLegacy(line) {
  const values = []; let start = 0, depth = 0, quote = null, escape = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === ',' && depth === 0) { values.push(line.slice(start,i).trim()); start = i+1; }
  }
  if (depth !== 0 || quote) throw new Error('Unbalanced TXT entry. Multiline legacy scripts are unsupported.');
  values.push(line.slice(start).trim()); return values;
}
function parseLegacy(text,filename) {
  const monster = /(?:mob|monster)_db/i.test(filename), item = /item_db/i.test(filename);
  if (!monster && !item) throw new Error('Legacy TXT filenames must contain item_db or mob_db.');
  const fields = item ? ['Id','AegisName','Name','Type','Buy','Sell','Weight','Attack','Defense','Range','Slots','JobMask','ClassMask','Gender','LocationMask','WeaponLevel','EquipLevelMin','Refineable','View','Script','EquipScript','UnEquipScript'] : ['Id','AegisName','Name','JapaneseName','Level','Hp','Sp','BaseExp','JobExp','AttackRange','Attack','Attack2','Defense','MagicDefense','Str','Agi','Vit','Int','Dex','Luk','SkillRange','ChaseRange','Size','Race','Element','ModeMask','WalkSpeed','AttackDelay','AttackMotion','DamageMotion','MvpExp'];
  const entries = [];
  for (const [lineNo,line] of text.replace(/^\uFEFF/,'').split(/\r?\n/).entries()) {
    if (!line.trim() || line.trimStart().startsWith('//')) continue;
    const values = splitLegacy(line);
    if (values.length !== (item ? 22 : 57)) throw new Error(`Line ${lineNo+1}: expected ${item ? 22 : 57} columns, found ${values.length}. Use YAML for other TXT variants.`);
    const entry = Object.create(null);
    fields.forEach((key,i) => { entry[key] = /^-?\d+$/.test(values[i]) ? Number(values[i]) : values[i]; });
    if (!Number.isSafeInteger(entry.Id) || entry.Id <= 0) throw new Error(`Line ${lineNo+1}: invalid ID.`);
    entry.LegacyColumns = values;
    if (monster) {
      entry.MvpDrops = []; entry.Drops = [];
      for (let i = 31; i < 57; i += 2) if (+values[i]) (i < 37 ? entry.MvpDrops : entry.Drops).push({Item:Number(values[i]),Rate:Number(values[i+1])});
    }
    entries.push(entry);
  }
  return { kind:item ? 'items':'monsters', entries, warnings:['Legacy TXT values and bitmasks are preserved as supplied; YAML gives richer named fields.'] };
}

function merge(a,b) {
  const result = Object.assign(Object.create(null),a);
  for (const [k,v] of Object.entries(b)) result[k] = v && typeof v === 'object' && !Array.isArray(v) && a?.[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? merge(a[k],v) : v;
  return result;
}
export function buildTables(parsed) {
  const items = Object.create(null), monsters = Object.create(null), client = Object.create(null), cardArt = Object.create(null), sources = {items:{},monsters:{},client:{},cardArt:{}};
  const warnings = [];
  for (const file of parsed) {
    warnings.push(...file.warnings.map(w => `${file.name}: ${w}`));
    if (['npcIdentity','jobNames','spawns','spawnConfig','maps'].includes(file.kind)) continue;
    if (file.kind === 'cardArt') {
      for(const [id,filename] of Object.entries(file.entries)) {
        if(Object.hasOwn(cardArt,id))warnings.push(`${file.name}: card ${id} overrides an earlier illustration filename.`);
        cardArt[id]=filename; (sources.cardArt[id] ||= []).push(file.name);
      }
    } else if (file.kind === 'client') {
      for (const [id,entry] of Object.entries(file.entries)) { client[id] = merge(client[id],entry); (sources.client[id] ||= []).push(file.name); }
    } else {
      const table = file.kind === 'items' ? items : monsters;
      for (const entry of file.entries) {
        if (table[entry.Id]) warnings.push(`${file.name}: ${file.kind} ID ${entry.Id} overrides earlier fields. Arrays are replaced.`);
        table[entry.Id] = merge(table[entry.Id],entry);
        (sources[file.kind][entry.Id] ||= []).push(file.name);
      }
    }
  }
  const itemDATA = Object.create(null), monsterDATA = Object.create(null);
  for (const id of new Set([...Object.keys(items),...Object.keys(client)])) {
    const db = items[id] || {}, info = client[id] || {};
    const descriptions = info.identifiedDescriptionName || [];
    itemDATA[id] = { id:Number(id), name:info.identifiedDisplayName || db.Name || db.AegisName || `Item ${id}`, aegisName:db.AegisName || '', description:Array.isArray(descriptions) ? descriptions : typeof descriptions === 'object' ? Object.values(descriptions) : [String(descriptions)], server:db, client:info, sources:[...(sources.items[id] || []),...(sources.client[id] || [])] };
    if(Object.hasOwn(cardArt,id)) {
      itemDATA[id].cardBmp=cardArt[id];
      itemDATA[id].sources.push(...sources.cardArt[id]);
    }
  }
  const unmatchedCards=Object.keys(cardArt).filter(id=>!Object.hasOwn(itemDATA,id));
  if(unmatchedCards.length)warnings.push(`${unmatchedCards.length} card illustration mappings have no imported item: ${unmatchedCards.slice(0,10).join(', ')}${unmatchedCards.length>10?'…':''}. Import the corresponding item database or iteminfo.lua to include them.`);
  const monsterMappings = resolveMonsterMappings(parsed, warnings);
  let unmappedMonsters = 0;
  for (const [id,db] of Object.entries(monsters)) {
    monsterDATA[id] = { id:Number(id), name:db.Name || db.AegisName || `Monster ${id}`, aegisName:db.AegisName || '', server:db, sources:sources.monsters[id] };
    if(db.AegisName)monsterDATA[id].gif=`${db.AegisName.toLowerCase()}.gif`;
    const mapping = monsterMappings.get(Number(id));
    if (mapping) {
      monsterDATA[id].spriteName = mapping.spriteName;
      monsterDATA[id].gif = mapping.spriteName.split(/[\\/]/).pop().replace(/\.(?:spr|act|gif)$/i, '') + '.gif';
      monsterDATA[id].sources = [...new Set([...monsterDATA[id].sources, ...mapping.sources])];
    } else unmappedMonsters++;
  }
  if (parsed.some(file => file.kind === 'jobNames') && unmappedMonsters) warnings.push(`${unmappedMonsters} monsters have no client sprite mapping; their AegisName GIF convention is retained when available. Server view overrides require a matching client view ID mapping.`);
  attachMonsterSpawns(parsed, monsterDATA, warnings);
  const lookup = new Set(Object.values(itemDATA).filter(item=>item.aegisName).map(item=>item.aegisName.toLowerCase())), unresolved = new Set();
  for(const monster of Object.values(monsterDATA)) for(const key of ['Drops','MvpDrops']) for(const drop of monster.server[key] || []) {
    if(typeof drop.Item === 'number' ? !itemDATA[drop.Item] : !lookup.has(String(drop.Item).toLowerCase())) unresolved.add(String(drop.Item));
  }
  if(unresolved.size) warnings.push(`${unresolved.size} drop references have no imported item: ${[...unresolved].slice(0,10).join(', ')}${unresolved.size>10?'…':''}. Add the corresponding item databases for cross-links.`);
  const mapDATA = buildMapTable(parsed, warnings);
  return { itemDATA,monsterDATA,mapDATA,warnings,mode:'renewal',schemaVersion:1 };
}
export function javascriptTable(name,table) {
  if (!['itemDATA','monsterDATA','mapDATA'].includes(name)) throw new Error('Invalid table name.');
  // Keep mapped filenames visible exactly as decoded from the client's table.
  const json=JSON.stringify(table,null,2)
    .replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return `// Generated by Ragnarok Atlas. Renewal source data; omitted server fields remain omitted.\nconst ${name} = ${json};\n`;
}
export function dropIndex(items,monsters) {
  const byName = new Map(Object.values(items).filter(i=>i.aegisName).map(i=>[i.aegisName.toLowerCase(),i.id])), index = new Map();
  for (const monster of Object.values(monsters)) for (const kind of ['Drops','MvpDrops']) for (const drop of monster.server[kind] || []) {
    const id = typeof drop.Item === 'number' ? drop.Item : byName.get(String(drop.Item).toLowerCase());
    if (id === undefined) continue;
    if (!index.has(id)) index.set(id,[]);
    index.get(id).push({ monster,drop,kind });
  }
  return { index,byName };
}
