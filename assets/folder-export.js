import { OUTPUT_FOLDERS, safeGrfPath } from './grf-core.js?v=5';

function hashName(value) {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(value)) hash = Math.imul(hash ^ byte, 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function suffixName(name, suffix) {
  const dot = name.lastIndexOf('.'), split = dot > 0 ? dot : name.length;
  return `${name.slice(0, split)}_${suffix}${name.slice(split)}`;
}
export function folderComponent(name) {
  // Chromium rejects Cc/Cf characters (including the CP1252 soft hyphen),
  // Unicode noncharacters, surrounding whitespace, and possible 8.3 aliases.
  let result = Array.from(name, character => {
    const cp = character.codePointAt(0);
    return /[\p{Cc}\p{Cf}\p{Cs}]/u.test(character) || (cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xffff) >= 0xfffe
      ? `_u${cp.toString(16).padStart(4, '0')}_` : character;
  }).join('');
  result = result.replace(/^\s+|\s+$/gu, value => Array.from(value, character => `_u${character.codePointAt(0).toString(16).padStart(4, '0')}_`).join(''));
  if (result.includes('~')) result = result.replaceAll('~', '_u007e_');
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(result)) result = `_${result}`;
  if (new TextEncoder().encode(result).length > 220) {
    const extension = result.match(/\.[a-z0-9]{1,10}$/i)?.[0] || '';
    let prefix = '';
    for (const character of result) {
      if (new TextEncoder().encode(prefix + character).length > 170) break;
      prefix += character;
    }
    result = `${prefix}_${hashName(name)}${extension}`;
  }
  return result;
}
function invalidName(error) {
  return error?.name === 'TypeError' && /name.*(?:not allowed|invalid)|not.*valid.*(?:name|file)/i.test(error.message);
}

export class FolderExport {
  constructor(root) {
    this.root = root;
    this.names = new Map();
    this.used = new Map();
    this.changes = [];
  }
  async initialize() {
    for (const folder of OUTPUT_FOLDERS) await this.root.getDirectoryHandle(folder, { create: true });
  }
  allocate(parent, original, fallback = false) {
    const key = `${parent}/${original}`.normalize('NFC').toLowerCase();
    if (!fallback && this.names.has(key)) return this.names.get(key);
    let candidate = folderComponent(original);
    if (fallback) {
      const extension = original.match(/\.[a-z0-9]{1,10}$/i)?.[0] || '';
      candidate = `resource_${hashName(original)}${extension}`;
    }
    const stem = candidate;
    let counter = 0;
    while (this.used.has(`${parent}/${candidate}`.normalize('NFC').toLowerCase()) && this.used.get(`${parent}/${candidate}`.normalize('NFC').toLowerCase()) !== key) {
      candidate = suffixName(stem, `${hashName(original)}${counter ? `_${counter}` : ''}`); counter++;
    }
    this.used.set(`${parent}/${candidate}`.normalize('NFC').toLowerCase(), key);
    this.names.set(key, candidate);
    return candidate;
  }
  async write(path, bytes) {
    const parts = safeGrfPath(path).split('/'), actual = [];
    let directory = this.root;
    try {
      for (let i = 0; i < parts.length; i++) {
        const parent = actual.join('/'), last = i === parts.length - 1;
        let name = this.allocate(parent, parts[i]);
        const getHandle = () => last ? directory.getFileHandle(name, { create: true }) : directory.getDirectoryHandle(name, { create: true });
        let handle;
        try { handle = await getHandle(); }
        catch (error) {
          if (!invalidName(error)) throw error;
          name = this.allocate(parent, parts[i], true);
          try { handle = await getHandle(); }
          catch (retryError) {
            if (!invalidName(retryError)) throw retryError;
            return { skipped: `${path}: the browser rejected this filename. Skipped; Download as ZIP preserves its original name.` };
          }
        }
        actual.push(name);
        if (last) {
          const writable = await handle.createWritable();
          try { await writable.write(bytes); await writable.close(); }
          catch (error) { await writable.abort().catch(() => {}); throw error; }
        } else directory = handle;
      }
    } catch (error) { throw new Error(`${path}: ${error.message}`, { cause: error }); }
    const savedPath = actual.join('/');
    if (savedPath !== path) {
      const change = { original: path, saved: savedPath }; this.changes.push(change);
      return { path: savedPath, warning: `${path}: saved as ${savedPath} for browser filename compatibility; see filename-map.json.` };
    }
    return { path };
  }
  async close() {
    if (this.changes.length) await this.write('filename-map.json', new TextEncoder().encode(JSON.stringify(this.changes, null, 2)));
  }
}
