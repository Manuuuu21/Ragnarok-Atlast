import { decodeFull, decodeHeader } from './vendor/grf-des.js';
import { decodeArchiveKeys, decodeProtectedEntry } from './grf-protected.js';

const HEADER_SIZE = 46;
export const OUTPUT_FOLDERS = ['cardbmp', 'collection', 'item', 'map', 'monster'];
export const GRF_LIMITS = { table: 128 * 1024 * 1024, asset: 64 * 1024 * 1024, entries: 1000000 };

async function read(file, offset, length) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > file.size) {
    throw new Error('GRF contains an out-of-range or truncated data block.');
  }
  const bytes = new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
  if (bytes.length !== length) throw new Error('Unable to read the complete GRF data block.');
  return bytes;
}

// Native streaming inflation validates the zlib checksum and caps actual output,
// including archives whose declared uncompressed size is dishonest.
export async function inflateGrf(bytes, expected, maximum) {
  if (!Number.isInteger(expected) || expected < 0 || expected > maximum) throw new Error('Decompressed GRF data exceeds the supported size limit.');
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.length;
      if (length > expected) throw new Error('GRF decompressed size does not match its file table.');
      chunks.push(result.value);
    }
    if (length !== expected) throw new Error('GRF decompressed size does not match its file table.');
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw new Error(`Cannot decompress GRF data: ${error.message}. The archive may be corrupt or use unsupported custom protection/compression.`);
  } finally { reader.releaseLock(); }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

export function safeGrfPath(path) {
  const normalized = path.replaceAll('\\', '/');
  if (!normalized || normalized.length > 4096) throw new Error('Empty or excessively long resource path.');
  const parts = normalized.split('/');
  for (const part of parts) {
    if (!part || part === '.' || part === '..' || /[\x00-\x1f<>:"|?*]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) {
      throw new Error('Unsafe or unsupported Windows resource path.');
    }
  }
  return normalized;
}

function category(path) {
  const parts = path.split('/'), lower = parts.map(part => part.toLowerCase());
  if (lower[0] !== 'data') return null;
  if (lower[1] === 'texture' && ['À¯ÀúÀÎÅÍÆäÀÌ½º'.toLowerCase(), '유저인터페이스'].includes(lower[2]) && OUTPUT_FOLDERS.slice(0, 4).includes(lower[3]) && parts.length > 4) {
    return { kind: 'texture', folder: lower[3], output: `${lower[3]}/${parts.slice(4).join('/')}` };
  }
  if (lower[1] === 'sprite' && ['¸ó½ºÅÍ'.toLowerCase(), '몬스터'].includes(lower[2]) && parts.length > 3 && /\.(act|spr)$/i.test(path)) {
    return { kind: 'sprite', folder: 'monster' };
  }
  return null;
}

export async function openGrf(file, encoding = 'windows-1252') {
  if (!['windows-1252', 'euc-kr', 'utf-8'].includes(encoding)) throw new Error('Unsupported filename encoding.');
  const header = await read(file, 0, HEADER_SIZE), view = new DataView(header.buffer);
  const signature = new TextDecoder().decode(header.subarray(0, 15)), version = view.getUint32(42, true);
  if (signature !== 'Master of Magic' && !signature.startsWith('Event Horizon\0')) throw new Error('This is not a Ragnarok GRF archive.');
  if (version !== 0x200 && version !== 0x300) throw new Error(`Unsupported GRF version 0x${version.toString(16)}. Supported versions are GRF 2.0 and 3.0.`);
  // GRF 3.0 replaces the 2.0 seed with the upper half of a 64-bit table offset;
  // its entry count is stored directly, without the seed + 7 adjustment.
  const modern = version === 0x300, recordSize = modern ? 21 : 17, tableHeaderSize = modern ? 12 : 8;
  const count = view.getUint32(38, true) - (modern ? 0 : view.getUint32(34, true) + 7);
  if (count < 0 || count > GRF_LIMITS.entries) throw new Error('Invalid or excessive GRF entry count.');
  const tableOffset = HEADER_SIZE + (modern ? Number(view.getBigUint64(30, true)) : view.getUint32(30, true));
  const tableHeader = await read(file, tableOffset, tableHeaderSize), sizes = new DataView(tableHeader.buffer);
  const keySize = modern ? sizes.getUint32(0, true) : 0;
  const compressedSize = sizes.getUint32(modern ? 4 : 0, true), size = sizes.getUint32(modern ? 8 : 4, true);
  if (compressedSize > GRF_LIMITS.table || size > GRF_LIMITS.table) throw new Error('GRF file table exceeds the 128 MB limit.');
  if (keySize > 20 + 65535 * 64 || tableOffset + tableHeaderSize + compressedSize + keySize > file.size) throw new Error('Invalid or truncated GRF file table/key block.');
  const table = await inflateGrf(await read(file, tableOffset + tableHeaderSize, compressedSize), size, GRF_LIMITS.table);
  const data = new DataView(table.buffer), decoder = new TextDecoder(encoding, { fatal: true });
  const entries = [], problems = [];
  let keys = new Map(), keyError;
  if (keySize) {
    try { keys = await decodeArchiveKeys(await read(file, tableOffset + tableHeaderSize + compressedSize, keySize)); }
    catch (error) { keyError = error.message; problems.push(`Archive encryption keys: ${keyError}`); }
  }
  let offset = 0;
  for (let i = 0; i < count; i++) {
    const end = table.indexOf(0, offset);
    if (end < 0 || end - offset > 4096 || end + 1 + recordSize > table.length) throw new Error('Truncated or invalid GRF file table entry.');
    const rawName = table.subarray(offset, end);
    let path;
    try { path = decoder.decode(table.subarray(offset, end)).replaceAll('\\', '/'); }
    catch { throw new Error('Cannot decode GRF filenames. Select the matching filename encoding and choose the archive again.'); }
    offset = end + 1;
    const entry = { path, compressedSize: data.getUint32(offset, true), alignedSize: data.getUint32(offset + 4, true), size: data.getUint32(offset + 8, true), flags: data.getUint8(offset + 12), offset: HEADER_SIZE + (modern ? Number(data.getBigUint64(offset + 13, true)) : data.getUint32(offset + 13, true)) };
    offset += recordSize;
    if (!(entry.flags & 0x81)) continue;
    const target = category(path);
    if (!target) continue;
    try {
      safeGrfPath(path);
      if (entry.flags !== 0x80 && (entry.flags & ~7)) throw new Error('Unsupported GRF entry flags (custom protection).');
      if (entry.size > GRF_LIMITS.asset || entry.alignedSize > GRF_LIMITS.asset) throw new Error('Asset exceeds the 64 MB limit.');
      if (!Number.isSafeInteger(entry.offset) || !Number.isSafeInteger(entry.offset + entry.alignedSize) || entry.compressedSize > entry.alignedSize || entry.offset + entry.alignedSize > file.size || entry.offset < HEADER_SIZE) throw new Error('Invalid GRF asset offset or size.');
      if ((entry.flags & 6) && entry.alignedSize % 8) throw new Error('Encrypted GRF asset is not aligned to 8 bytes.');
      entries.push({ ...entry, ...target, ...(entry.flags === 0x80 ? { rawName: rawName.slice() } : {}) });
    } catch (error) { problems.push(`${path}: ${error.message}`); }
  }
  if (offset !== table.length) throw new Error('GRF file table length does not match its entry count.');
  return { file, entries, problems, count, encoding, version, keys, keyError };
}

export async function readGrfEntry(archive, entry) {
  const bytes = await read(archive.file, entry.offset, entry.alignedSize);
  if (entry.flags === 0x80) return decodeProtectedEntry(bytes, entry.rawName, entry.size, archive.keys, GRF_LIMITS.asset, inflateGrf);
  if (entry.flags & 2) decodeFull(bytes, bytes.length, entry.compressedSize);
  else if (entry.flags & 4) decodeHeader(bytes, bytes.length);
  return inflateGrf(bytes.subarray(0, entry.compressedSize), entry.size, GRF_LIMITS.asset);
}

export function planGrfExport(archive) {
  const textures = [], groups = new Map(), problems = [...archive.problems], outputs = new Map();
  const counts = Object.fromEntries(OUTPUT_FOLDERS.map(folder => [folder, 0]));
  function reserve(output, source) {
    const key = output.normalize('NFC').toLowerCase();
    if (outputs.has(key)) { problems.push(`${source}: duplicate output ${output}; already reserved by ${outputs.get(key)}. Skipped.`); return false; }
    outputs.set(key, source); return true;
  }
  for (const entry of archive.entries) {
    if (entry.kind === 'texture') {
      if (reserve(entry.output, entry.path)) { textures.push(entry); counts[entry.folder]++; }
    } else {
      const match = entry.path.match(/^(.*)\.(act|spr)$/i), key = match[1].normalize('NFC').toLowerCase(), ext = match[2].toLowerCase();
      if (!groups.has(key)) groups.set(key, { path: match[1], name: match[1].split('/').pop() });
      const pair = groups.get(key);
      if (pair[ext]) pair.duplicate = true;
      pair[ext] = entry;
    }
  }
  const pairs = [];
  for (const pair of groups.values()) {
    if (pair.duplicate) problems.push(`${pair.path}: duplicate ACT/SPR entries; skipped.`);
    else if (!pair.act || !pair.spr) problems.push(`${pair.path}: missing .${pair.act ? 'spr' : 'act'}; skipped.`);
    else if (reserve(`monster/${pair.name}.gif`, pair.path)) { pairs.push({ ...pair, output: `monster/${pair.name}.gif` }); counts.monster++; }
  }
  return { textures, pairs, problems, counts, total: textures.length + pairs.length };
}
