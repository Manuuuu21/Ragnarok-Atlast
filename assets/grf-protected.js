// Gravity's 0x80 records carry a 104-byte header and authenticate the original
// filename bytes and output with XXH128. All decoding stays in the browser.
// Wire-format reference: Tokeiburu/GRFEditor, GRF/Core/GrfCompression/ProtectedGrfDecoder.cs.
import { xxhash128 } from './vendor/xxhash128-4.12.0.js';
import { xxhash32 } from './vendor/xxhash32-4.12.0.js';

const fail = message => { throw new Error(`Protected GRF: ${message}`); };
const u32 = (bytes, offset = 0) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
const rot = (x, n) => (x << (n & 31)) | (x >>> ((32 - n) & 31));
const fromHex = hex => Uint8Array.from(hex.match(/../g), byte => parseInt(byte, 16));
const same = (a, b) => a.length === b.length && a.every((byte, index) => byte === b[index]);
const hash = async (bytes, low = 0, high = 0) => fromHex(await xxhash128(bytes, low, high)).reverse();
const checksum = async bytes => parseInt(await xxhash32(bytes), 16);
const wordsBE = bytes => Array.from({ length: bytes.length / 4 }, (_, i) => new DataView(bytes.buffer, bytes.byteOffset).getUint32(i * 4));
const asBytes = (words, little = false) => {
  const bytes = new Uint8Array(words.length * 4), view = new DataView(bytes.buffer);
  words.forEach((word, i) => view.setUint32(i * 4, word, little)); return bytes;
};

async function aesCbc(bytes, keyBytes, iv) {
  if (bytes.length % 16) fail('incomplete AES block.');
  if (!bytes.length) return bytes;
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['encrypt', 'decrypt']);
  // WebCrypto requires PKCS#7. Append a valid encrypted padding block, using
  // the last ciphertext block as IV, to decode this format's unpadded CBC.
  const padding = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: bytes.slice(-16) }, key, new Uint8Array());
  const padded = new Uint8Array(bytes.length + 16); padded.set(bytes); padded.set(new Uint8Array(padding), bytes.length);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, padded));
}

function chamCbc(bytes, key, iv) {
  if (bytes.length % 16) fail('incomplete CHAM block.');
  const schedule = new Uint32Array(8);
  wordsBE(key).forEach((word, i) => {
    schedule[i] = word ^ rot(word, 1) ^ rot(word, 8);
    schedule[(i + 4) ^ 1] = word ^ rot(word, 1) ^ rot(word, 11);
  });
  const out = new Uint8Array(bytes.length);
  for (let start = 0; start < bytes.length; start += 16) {
    const state = wordsBE(bytes.subarray(start, start + 16));
    for (let r = 79; r >= 0; r--) {
      const slot = r & 3, odd = r & 1;
      const mixed = (rot(state[(slot + 1) & 3], odd ? 8 : 1) ^ schedule[r & 7]) >>> 0;
      state[slot] = (rot(state[slot], odd ? 31 : 24) - mixed) ^ r;
    }
    const block = asBytes(state), previous = start ? bytes.subarray(start - 16, start) : iv;
    out.set(block.map((value, i) => value ^ previous[i]), start);
  }
  return out;
}

function threeWayBlock(key, bytes) {
  let [a, b, c] = wordsBE(bytes), rc = 0x0b0b;
  const k = wordsBE(key);
  function theta() {
    const mix = rot(a ^ b ^ c, 16) ^ rot(a ^ b ^ c, 8);
    const x = (a << 24) ^ (c >>> 8) ^ (b << 8) ^ (a >>> 24);
    const y = (b << 24) ^ (a >>> 8) ^ (c << 8) ^ (b >>> 24);
    a ^= mix ^ x; b ^= mix ^ y; c ^= mix ^ (x >>> 16) ^ (y << 16);
  }
  for (let r = 0; r <= 11; r++) {
    a ^= k[0] ^ (rc << 16); b ^= k[1]; c ^= k[2] ^ rc; theta();
    if (r === 11) break;
    const left = rot(a, 22), right = rot(c, 1);
    a = rot(left ^ (b | ~right), 1); c = rot(right ^ (left | ~b), 22); b ^= right | ~left;
    rc <<= 1; if (rc & 0x10000) rc ^= 0x11011;
  }
  return asBytes([a, b, c]);
}

function cfb(bytes, iv, blockSize, encrypt) {
  if (bytes.length % blockSize) fail('incomplete CFB block.');
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += blockSize) {
    const mask = encrypt(i ? bytes.subarray(i - blockSize, i) : iv);
    for (let j = 0; j < blockSize; j++) out[i + j] = bytes[i + j] ^ mask[j];
  }
  return out;
}

function ideaMask(key, data, iv) {
  const schedule = [], multiply = (a, b) => ((a || 65536) * (b || 65536) % 65537) & 0xffff;
  let rotated = key.slice();
  while (schedule.length < 52) {
    for (let i = 0; i < 16 && schedule.length < 52; i += 2) schedule.push(rotated[i] * 256 + rotated[i + 1]);
    rotated = rotated.map((_, i) => (rotated[(i + 3) % 16] << 1) | (rotated[(i + 4) % 16] >>> 7));
  }
  function block(bytes) {
    let [a, b, c, d] = Array.from({ length: 4 }, (_, i) => bytes[i * 2] * 256 + bytes[i * 2 + 1]);
    for (let r = 0; r < 48; r += 6) {
      a = multiply(a, schedule[r]); b = (b + schedule[r + 1]) & 0xffff;
      c = (c + schedule[r + 2]) & 0xffff; d = multiply(d, schedule[r + 3]);
      const x = multiply(a ^ c, schedule[r + 4]);
      const y = multiply(((b ^ d) + x) & 0xffff, schedule[r + 5]), z = (x + y) & 0xffff;
      [a, b, c, d] = [a ^ y, c ^ y, b ^ z, d ^ z];
    }
    const values = [multiply(a, schedule[48]), (c + schedule[49]) & 0xffff, (b + schedule[50]) & 0xffff, multiply(d, schedule[51])];
    return Uint8Array.from(values.flatMap(value => [value >>> 8, value & 255]));
  }
  const first = block(data.slice(0, 8).map((v, i) => v ^ iv[i]));
  const second = block(data.slice(8, 16).map((v, i) => v ^ first[i]));
  const mask = new Uint8Array(16); mask.set(first); mask.set(second, 8); return mask;
}

function rc6(key) {
  const L = Uint32Array.from({ length: 4 }, (_, i) => u32(key, i * 4));
  const S = Uint32Array.from({ length: 44 }, (_, i) => 0xb7e15163 + i * 0x9e3779b9);
  let a = 0, b = 0;
  for (let n = 0; n < 132; n++) {
    a = S[n % 44] = rot(S[n % 44] + a + b, 3);
    b = L[n % 4] = rot(L[n % 4] + a + b, a + b);
  }
  return bytes => {
    let a = u32(bytes), b = (u32(bytes, 4) + S[0]) >>> 0, c = u32(bytes, 8), d = (u32(bytes, 12) + S[1]) >>> 0;
    for (let r = 1; r <= 20; r++) {
      const t = rot(Math.imul(b, 2 * b + 1), 5), u = rot(Math.imul(d, 2 * d + 1), 5);
      [a, b, c, d] = [b, (rot(c ^ u, t) + S[2 * r + 1]) >>> 0, d, (rot(a ^ t, u) + S[2 * r]) >>> 0];
    }
    return asBytes([a + S[42], b, c + S[43], d], true);
  };
}

export async function decodeArchiveKeys(raw) {
  if (raw.length < 20 || u32(raw) !== 0x101) fail('unsupported archive key block.');
  const length = u32(raw, 12);
  if (!length || length % 64 || length > 65535 * 64 || length !== raw.length - 20) fail('invalid archive key-block length.');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('uf8E8qAwHthrLxiS')));
  const decoded = chamCbc(raw.subarray(20), digest.subarray(0, 16), digest.subarray(16));
  if (await checksum(decoded) !== u32(raw, 16)) fail('archive key-block checksum mismatch.');
  const keys = new Map();
  for (let p = 0; p < length; p += 64) {
    const id = u32(decoded, p);
    if (!id || id > 65535 || keys.has(id)) fail('invalid archive key ID.');
    keys.set(id, decoded.slice(p + 4, p + 64));
  }
  return keys;
}

function lz4(bytes, size) {
  const out = new Uint8Array(size); let input = 0, output = 0;
  function length(base) {
    if (base === 15) {
      let next;
      do { if (input >= bytes.length) fail('truncated LZ4 length.'); next = bytes[input++]; base += next; } while (next === 255);
    }
    return base;
  }
  while (input < bytes.length) {
    const token = bytes[input++], literals = length(token >>> 4);
    if (input + literals > bytes.length || output + literals > size) fail('LZ4 literals exceed declared size.');
    out.set(bytes.subarray(input, input + literals), output); input += literals; output += literals;
    if (input === bytes.length) break;
    if (input + 2 > bytes.length) fail('truncated LZ4 offset.');
    const distance = bytes[input++] | (bytes[input++] << 8), match = length(token & 15) + 4;
    if (!distance || distance > output || output + match > size) fail('invalid LZ4 match.');
    for (let i = 0; i < match; i++) { out[output] = out[output - distance]; output++; }
  }
  if (output !== size || !bytes.length) fail('LZ4 output size mismatch.');
  return out;
}

async function decodeHeader(payload, nameHash) {
  if (payload.length < 104 || payload[0] !== 1) fail('unsupported or truncated header.');
  const header = payload.slice(0, 104), type = header[1];
  if ([1, 2, 15].includes(type)) {
    const iv = type === 1 ? fromHex('4ce8a1ae45b321607e4f26a4bb140c96') : type === 2 ? nameHash : await hash(header.subarray(4, 8));
    header.set(await aesCbc(header.subarray(8), fromHex('56fd7e712f6d36f55ca599e67b18107a'), iv), 8);
  } else if (type === 113) {
    header.set(cfb(header.subarray(8), fromHex('a095dfcfd04b74db027ede09'), 12, block => threeWayBlock(fromHex('ad61aedabf203e1dfe1db72b'), block)), 8);
  } else fail(`unsupported header type ${type}.`);
  if (await checksum(header.subarray(8)) !== u32(header, 4)) fail('header checksum mismatch.');
  return header;
}

export async function decodeProtectedEntry(payload, rawName, size, keys, maximum, inflate) {
  if (!Number.isInteger(size) || size < 0 || size > maximum || payload.length > maximum) fail('asset exceeds the supported size limit.');
  const nameHash = await hash(rawName), header = await decodeHeader(payload, nameHash);
  const padded = u32(header, 12), compressed = u32(header, 16), cipher = header[8] | header[9] << 8, compression = header[10];
  if (u32(header, 20) !== size || compressed > padded || padded > payload.length - 104) fail('body size differs from the file table or payload.');
  if (![1, 5, 7, 128, 133].includes(cipher) || compression > 2 || (header[11] & ~1)) fail('unsupported encryption or compression method.');
  const keyId = u32(header, 40), material = keyId ? keys?.get(keyId) : header.subarray(44, 104);
  if (!material || material.length !== 60) fail(`missing archive key ${keyId}.`);
  const outputHash = header.slice(24, 40), parameters = new Uint8Array(64);
  parameters.set(material.map((byte, i) => byte ^ (header[11] & 1 ? outputHash[i % 16] : 0)));
  const body = payload.slice(104, 104 + padded), tail = body.subarray(128);
  if (compressed > 128) {
    if (cipher === 1) {
      const seeded = await hash(rawName, size), key = await hash(parameters.subarray(0, 60), u32(seeded, 8), u32(seeded, 12));
      const full = Math.floor(tail.length / 16) * 16, span = Math.min(full, 1024);
      tail.set(chamCbc(tail.subarray(0, span), key, outputHash));
      let previous = outputHash;
      for (let p = 0; p < full; p += 16) {
        const block = tail.slice(p, p + 16);
        for (let i = 0; i < 16; i++) tail[p + i] = block[(i + 12) % 16] ^ seeded[(i + 12) % 16] ^ previous[i];
        previous = block;
      }
      for (let i = 0; i < tail.length - full; i++) tail[full + i] ^= seeded[i] ^ previous[i];
    } else if (cipher === 5 || cipher === 7) {
      const total = compressed - 128, span = Math.min(total, 1024), paddedSpan = (Math.floor(span / 16) + 1) * 16;
      if (tail.length !== paddedSpan + total - span) fail('invalid AES body padding length.');
      const keyStart = cipher === 5 ? 0 : 28, ivStart = cipher === 5 ? 16 : 44;
      tail.set(await aesCbc(tail.subarray(0, paddedSpan), parameters.slice(keyStart, keyStart + 16), parameters.slice(ivStart, ivStart + 16)));
      const pad = paddedSpan - span;
      if (!tail.subarray(span, paddedSpan).every(byte => byte === pad)) fail('invalid AES body padding.');
      tail.copyWithin(span, paddedSpan);
      const mask = cipher === 5 ? ideaMask(nameHash, outputHash, parameters.slice(48, 56)) : ideaMask(outputHash, nameHash, parameters.slice(52, 60));
      for (let i = span; i < total; i++) tail[i] ^= mask[(i - span) % 16];
    } else {
      const mask = cipher === 128 ? ideaMask(outputHash, nameHash, parameters.slice(49, 57)) : ideaMask(nameHash, outputHash, parameters.slice(49, 57));
      if (cipher === 128) {
        const start = tail.length < 3072 ? 0 : 2048, span = tail.length < 3072 ? Math.floor(tail.length / 16) * 16 : 1024;
        tail.set(await aesCbc(tail.subarray(start, start + span), parameters.slice(44, 60), parameters.slice(28, 44)), start);
      } else {
        const span = Math.min(Math.floor(tail.length / 16) * 16, 1024);
        tail.set(cfb(tail.subarray(0, span), parameters.slice(40, 56), 16, rc6(parameters.slice(24, 40))));
      }
      for (let i = 0; i < tail.length; i++) tail[i] ^= mask[i % 16];
    }
  }
  let output;
  if (compression === 0) { if (compressed !== size) fail('stored output size mismatch.'); output = body.slice(0, size); }
  else if (compression === 1) output = await inflate(body.subarray(0, compressed), size, maximum);
  else output = lz4(body.subarray(0, compressed), size);
  if (!same(await hash(output), outputHash)) fail('output checksum mismatch.');
  return output;
}
