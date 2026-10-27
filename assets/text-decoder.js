export const textEncodings = [
  ['auto', 'Auto (UTF-8 / legacy)'],
  ['utf-8', 'UTF-8'],
  ['euc-kr', 'Korean (EUC-KR / CP949)'],
  ['windows-1252', 'Western (Windows-1252)'],
  ['windows-874', 'Thai (Windows-874)'],
  ['windows-1251', 'Cyrillic (Windows-1251)'],
  ['shift_jis', 'Japanese (Shift-JIS)'],
  ['gb18030', 'Chinese (GB18030)'],
  ['big5', 'Traditional Chinese (Big5)'],
  ['utf-16le', 'UTF-16 LE'],
  ['utf-16be', 'UTF-16 BE']
];

// Only a BOM or valid UTF-8 is conclusive. Legacy fallbacks are reported as
// guesses and can be overridden per file, without changing other source files.
export function decodeSource(buffer, requested = 'auto', legacyFallbacks = ['euc-kr', 'windows-1252']) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const starts = (...values) => values.every((v, i) => bytes[i] === v);
  if (starts(0x1b, 0x4c, 0x75, 0x61) || starts(0x1b, 0x4c, 0x4a)) {
    throw new Error('Compiled Lua bytecode is unsupported. Use a decompiled text itemInfo.lua file.');
  }
  if (!textEncodings.some(([value]) => value === requested)) throw new Error('Unsupported text encoding.');
  const decode = encoding => new TextDecoder(encoding, { fatal: true }).decode(bytes);
  const label = encoding => textEncodings.find(([value]) => value === encoding)[1];
  function explicit(encoding) {
    try { return { text: decode(encoding), encoding, warnings: [] }; }
    catch { throw new Error(`This file is not valid ${label(encoding)}. Choose Auto or set this file's encoding in the source list, then rebuild.`); }
  }
  if (requested !== 'auto') return explicit(requested);
  if (starts(0xff, 0xfe, 0, 0) || starts(0, 0, 0xfe, 0xff)) throw new Error('UTF-32 is unsupported. Save this file as UTF-8 first.');
  if (starts(0xef, 0xbb, 0xbf)) return explicit('utf-8');
  if (starts(0xff, 0xfe)) return explicit('utf-16le');
  if (starts(0xfe, 0xff)) return explicit('utf-16be');
  try { return { text: decode('utf-8'), encoding: 'utf-8', warnings: [] }; }
  catch { /* Try lossless legacy decoders below. */ }
  for (const encoding of legacyFallbacks) {
    let text;
    try { text = decode(encoding); } catch { continue; }
    return {
      text, encoding,
      warnings: [`Not valid UTF-8; decoded using ${label(encoding)} as a fallback. Legacy encodings cannot be identified reliably from bytes alone. Check names, descriptions, and resource filenames; if they look wrong, choose the correct encoding for this file and rebuild.`]
    };
  }
  throw new Error('Could not decode this file. Choose its encoding in the source list or save it as UTF-8.');
}
