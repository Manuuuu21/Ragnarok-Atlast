// Read the straight-line table assignments in Gravity's Lua 5.1 accessory tables.
// No Lua runtime, function calls, jumps, or access to host globals is permitted.
export function readAccessoryLub(bytes, globals = new Map()) {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const need = length => {
    if (!Number.isSafeInteger(length) || length < 0 || offset + length > bytes.length) throw new Error('Truncated accessory LUB.');
  };
  const u8 = () => { need(1); return data.getUint8(offset++); };
  const u32 = () => { need(4); const n = data.getUint32(offset, true); offset += 4; return n; };
  const skip = length => { need(length); offset += length; };
  const count = maximum => { const n = u32(); if (n > maximum) throw new Error('Accessory LUB exceeds its size limit.'); return n; };
  const string = () => {
    const length = count(1024 * 1024);
    if (!length) return '';
    need(length);
    if (bytes[offset + length - 1] !== 0) throw new Error('Invalid LUB string terminator.');
    const value = new TextDecoder('windows-1252').decode(bytes.subarray(offset, offset + length - 1));
    offset += length;
    return value;
  };
  if (bytes.length > 8 * 1024 * 1024) throw new Error('Accessory LUB is too large.');
  for (const value of [27, 76, 117, 97, 81, 0, 1, 4, 4, 4, 8, 0]) {
    if (u8() !== value) throw new Error('Expected a little-endian Lua 5.1 accessory table (32-bit sizes, 64-bit numbers).');
  }
  string(); skip(8);
  const upvalues = u8(), parameters = u8();
  u8(); const registers = new Array(u8());
  if (upvalues || parameters) throw new Error('Accessory tables cannot take parameters or upvalues.');
  const code = Array.from({ length: count(200000) }, u32);
  const constants = Array.from({ length: count(100000) }, () => {
    const type = u8();
    if (type === 0) return null;
    if (type === 1) return u8() !== 0;
    if (type === 4) return string();
    if (type === 3) {
      need(8); const value = data.getFloat64(offset, true); offset += 8;
      if (!Number.isFinite(value)) throw new Error('Invalid LUB number.');
      return value;
    }
    throw new Error('Unsupported LUB constant.');
  });
  if (u32() !== 0) throw new Error('Accessory tables cannot contain functions.');
  skip(count(200000) * 4);
  for (let n = count(10000); n > 0; n--) { string(); skip(8); }
  for (let n = count(10000); n > 0; n--) string();
  if (offset !== bytes.length) throw new Error('Unexpected bytes after accessory LUB.');
  const constant = index => {
    if (index >= constants.length) throw new Error('Invalid LUB constant index.');
    return constants[index];
  };
  const register = index => {
    if (index >= registers.length) throw new Error('Invalid LUB register.');
    return registers[index];
  };
  const operand = value => value & 256 ? constant(value & 255) : register(value);
  let returned = false;
  for (const instruction of code) {
    const op = instruction & 63, a = (instruction >>> 6) & 255;
    const b = instruction >>> 23, c = (instruction >>> 14) & 511, bx = instruction >>> 14;
    if (returned || a >= registers.length) throw new Error('Invalid accessory table instructions.');
    if (op === 0) registers[a] = register(b);
    else if (op === 1) registers[a] = constant(bx);
    else if (op === 5) {
      const name = constant(bx);
      if (!globals.has(name)) throw new Error(`Missing accessory table ${name}.`);
      registers[a] = globals.get(name);
    } else if (op === 6) {
      const table = register(b), key = operand(c);
      if (!(table instanceof Map) || !table.has(key)) throw new Error(`Missing accessory key ${key}.`);
      registers[a] = table.get(key);
    } else if (op === 7) {
      const name = constant(bx);
      if (!['ACCESSORY_IDs', 'AccNameTable'].includes(name) || !(register(a) instanceof Map)) throw new Error('Unsupported accessory global.');
      globals.set(name, register(a));
    } else if (op === 9) {
      const table = register(a), key = operand(b), value = operand(c);
      if (!(table instanceof Map) || !['string', 'number'].includes(typeof key) || !['string', 'number'].includes(typeof value)) throw new Error('Invalid accessory table entry.');
      table.set(key, value);
    } else if (op === 10) registers[a] = new Map();
    else if (op === 30 && b === 1) returned = true;
    else throw new Error(`Unsupported instruction ${op} in accessory table; only literal table assignments are supported.`);
  }
  if (!returned) throw new Error('Accessory table has no return.');
  return globals;
}
