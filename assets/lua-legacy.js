import { hangulCp949 } from './lua-legacy-map.js';

let pairs;
const western = new TextDecoder('windows-1252');

// Recover the CP949 bytes behind Korean Lua text, then display those bytes as
// Western filename characters. Already-Western text is left byte-for-byte alone.
export function legacyLuaText(text) {
  return text.replace(/\p{Script=Hangul}+/gu, run => {
    pairs ||= atob(hangulCp949);
    return Array.from(run.normalize('NFC'), character => {
      const code = character.codePointAt(0);
      const index = code >= 0xac00 && code <= 0xd7a3 ? code - 0xac00
        : code >= 0x3131 && code <= 0x318e ? 11172 + code - 0x3131 : -1;
      if (index < 0) throw new Error(`Korean Lua character U+${code.toString(16).toUpperCase()} has no supported CP949 filename mapping.`);
      return western.decode(Uint8Array.of(pairs.charCodeAt(index * 2), pairs.charCodeAt(index * 2 + 1)));
    }).join('');
  });
}

export function legacyLuaFields(value) {
  if (typeof value === 'string') return legacyLuaText(value);
  if (value === null || typeof value !== 'object') return value;
  const result = Array.isArray(value) ? [] : Object.create(null);
  for (const [key, child] of Object.entries(value)) {
    const convertedKey = legacyLuaText(key);
    if (Object.hasOwn(result, convertedKey)) throw new Error('Lua keys collide after legacy filename conversion.');
    result[convertedKey] = legacyLuaFields(child);
  }
  return result;
}
