import { parseDatabase, buildTables, isCardIllustrationTable } from './data-core.js?v=maps-4';
import { isMapBitmap, parseMapBitmap } from './map-data.js?v=maps-4';
import { decodeSource } from './text-decoder.js';
self.onmessage = async ({data}) => {
  const parsed = [], errors = [], decoding = [];
  for (let i = 0; i < data.files.length; i++) {
    const file = data.files[i], name = file.webkitRelativePath || file.name;
    try {
      if (file.size > 64*1024*1024) throw new Error('File exceeds 64 MB.');
      if (isMapBitmap(name)) {
        parsed.push({ ...parseMapBitmap(name), name });
        self.postMessage({type:'progress',done:i+1,total:data.files.length});
        continue;
      }
      // Lua and card resource bytes use the Western characters of extracted
      // filenames. Unicode Korean Lua fields are also converted after parsing.
      const westernFilenames = isCardIllustrationTable(name) || /\.(lua|lub)$/i.test(name);
      const decoded = decodeSource(await file.arrayBuffer(),data.fileEncodings?.[i] || data.encoding || 'auto',westernFilenames ? ['windows-1252'] : undefined);
      decoding.push({name,encoding:decoded.encoding,warnings:decoded.warnings});
      const result = parseDatabase(decoded.text,name);
      parsed.push({...result,warnings:[...decoded.warnings,...result.warnings],name});
    } catch (e) { errors.push(`${name}: ${e.message}`); }
    self.postMessage({type:'progress',done:i+1,total:data.files.length});
  }
  if (errors.length) { self.postMessage({type:'errors',errors,decoding}); return; }
  try { self.postMessage({type:'complete',tables:buildTables(parsed),decoding}); }
  catch (e) { self.postMessage({type:'errors',errors:[e.message],decoding}); }
};
