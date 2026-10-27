// A data-only Lua table reader. Never executes Lua, functions, or expressions.
export function parseLuaTable(text, { jobKeys = false, allowDuplicates = false } = {}) {
  let p = 0, entries = 0;
  const warnings = [];
  text = text.replace(/^\uFEFF/, '');
  function fail(message) { throw new Error(`${message} (line ${text.slice(0,p).split('\n').length}).`); }
  function longString() {
    const match = text.slice(p).match(/^\[(=*)\[/);
    if (!match) return null;
    p += match[0].length;
    const end = text.indexOf(']'+match[1]+']',p);
    if (end < 0) fail('Unterminated Lua long string');
    const value = text.slice(p,end).replace(/^\r?\n/,'');
    p = end+match[1].length+2; return value;
  }
  function space() {
    for (;;) {
      while (/\s/.test(text[p] || '') && p < text.length) p++;
      if (text.slice(p,p+2) !== '--') return;
      p += 2;
      if (longString() === null) { const end = text.indexOf('\n',p); p = end < 0 ? text.length : end+1; }
    }
  }
  function expect(c) { space(); if (text[p++] !== c) fail(`Expected '${c}'`); }
  function quoted() {
    const quote = text[p++]; let result = '';
    while (p < text.length) {
      let c = text[p++];
      if (c === quote) return result;
      if (c === '\\') {
        c = text[p++];
        const map = { a:'\x07', b:'\b', f:'\f', n:'\n', r:'\r', t:'\t', v:'\v', '\\':'\\', '"':'"', "'":"'" };
        if (Object.hasOwn(map,c)) result += map[c];
        else if (c === 'z') { while (/\s/.test(text[p] || '') && p < text.length) p++; }
        else if (c === '\n') result += '\n';
        else if (c === '\r') { if (text[p] === '\n') p++; result += '\n'; }
        else if (/\d/.test(c || '')) { const n = (c+text.slice(p)).match(/^\d{1,3}/)[0]; if (+n > 255) fail('Invalid Lua decimal escape'); result += String.fromCharCode(+n); p += n.length-1; }
        else if (c === 'x' && /^[0-9a-f]{2}/i.test(text.slice(p))) { result += String.fromCharCode(parseInt(text.slice(p,p+2),16)); p += 2; }
        else fail('Unsupported Lua escape');
      } else result += c;
    }
    fail('Unterminated Lua string');
  }
  function value(depth) {
    if (depth > 30 || ++entries > 2000000) fail('Lua table exceeds import limits');
    space(); let result;
    if (text[p] === '{') result = table(depth+1);
    else if (text[p] === '"' || text[p] === "'") result = quoted();
    else if (text[p] === '[') { result = longString(); if (result === null) fail('Expected Lua string'); }
    else {
      const token = text.slice(p).match(/^(?:-?(?:0x[\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)|true\b|false\b|nil\b)/i);
      if (!token) fail('Unsupported Lua expression; use a literal iteminfo table');
      p += token[0].length;
      result = token[0] === 'true' ? true : token[0] === 'false' ? false : token[0] === 'nil' ? null : Number(token[0]);
    }
    space();
    while (text.slice(p,p+2) === '..') {
      if (!['string','number'].includes(typeof result)) fail('Invalid Lua concatenation');
      p += 2; const right = value(depth+1);
      if (!['string','number'].includes(typeof right)) fail('Invalid Lua concatenation');
      result = String(result)+String(right); space();
    }
    return result;
  }
  function table(depth) {
    expect('{'); const object = Object.create(null); let index = 1, explicit = false;
    for (;;) {
      space(); if (text[p] === '}') { p++; break; }
      if (p >= text.length) fail('Unterminated Lua table');
      let key;
      if (text[p] === '[' && !/^\[=*\[/.test(text.slice(p))) {
        p++; space();
        const reference = jobKeys && text.slice(p).match(/^jobtbl\s*\.\s*(JT_\w+)/);
        if (reference) { key = reference[1]; p += reference[0].length; }
        else key = value(depth);
        expect(']'); expect('='); explicit = true;
      } else {
        const named = text.slice(p).match(/^([a-zA-Z_]\w*)\s*=(?!=)/);
        if (named) { key = named[1]; p += named[0].length; explicit = true; }
        else key = index++;
      }
      if (!['number','string'].includes(typeof key) || ['__proto__','constructor','prototype'].includes(String(key))) fail('Invalid Lua table key');
      if (Object.hasOwn(object,key)) {
        if (!allowDuplicates) fail(`Duplicate Lua key ${key}`);
        warnings.push(`Duplicate Lua key ${key}; the last mapping was kept.`);
      }
      object[key] = value(depth);
      space(); if (text[p] === ',' || text[p] === ';') p++; else if (text[p] !== '}') fail('Expected comma or closing brace');
    }
    return explicit ? object : Object.values(object);
  }
  space();
  // Standard forms: tbl = {...}, local itemInfo = {...}, return {...}, or {...}.
  if (text[p] !== '{') {
    const prefix = text.slice(p).match(/^(?:(?:local\s+)?([a-zA-Z_]\w*)\s*=\s*|return\s+)/);
    if (!prefix) fail('Expected an iteminfo table assignment or return table');
    p += prefix[0].length;
  }
  const items = value(0);
  if (!items || typeof items !== 'object' || (Array.isArray(items) && items.length)) fail('Expected a keyed Lua table');
  space(); if (text[p] === ';') { p++; space(); }
  const trailing = text.slice(p).trim();
  if (trailing) warnings.push('Lua code after the literal table was not executed. Only the table contents were imported.');
  return { items, warnings };
}

export function parseItemInfo(text) {
  const result = parseLuaTable(text);
  for (const [id,item] of Object.entries(result.items)) if (!/^\d+$/.test(id) || !item || Array.isArray(item) || typeof item !== 'object') throw new Error(`Invalid iteminfo entry ${id}`);
  return result;
}
