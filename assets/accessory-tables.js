import { readAccessoryLub } from './accessory-lub.js';
import { parseLuaTable } from './lua.js?v=accessory-tables-1';
import { legacyLuaText } from './lua-legacy.js';

// Accept compiled client tables or GRF Editor's readable .lub/.lua exports.
// Resolve only literal keys against the supplied ID table; never execute Lua.
export function readAccessoryTable(bytes, name, globals = new Map()) {
  if (!['ACCESSORY_IDs', 'AccNameTable'].includes(name)) throw new Error('Unsupported accessory table.');
  if (bytes.length > 8 * 1024 * 1024) throw new Error('Accessory table is too large.');
  if (bytes[0] === 27) {
    readAccessoryLub(bytes, globals);
    if (!globals.has(name)) throw new Error(`Missing accessory table ${name}.`);
    return globals;
  }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder('windows-1252').decode(bytes); }
  const { items, warnings } = parseLuaTable(text, { keyTables: globals, expectedGlobal: name });
  if (warnings.length) throw new Error('Accessory files must contain only a literal table assignment.');
  const values = new Map();
  for (const [key, value] of Object.entries(items)) {
    if (name === 'ACCESSORY_IDs') {
      if (!/^[a-zA-Z_]\w*$/.test(key) || !Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid accessory ID ${key}.`);
      values.set(key, value);
    } else {
      if (!/^\d+$/.test(key) || !Number.isSafeInteger(Number(key)) || typeof value !== 'string' || /[\\/\x00-\x1f]/.test(value)) throw new Error(`Invalid accessory name for view ${key}.`);
      values.set(Number(key), legacyLuaText(value));
    }
  }
  globals.set(name, values);
  return globals;
}
