import { javascriptTable, isCardIllustrationTable } from './data-core.js?v=maps-4';
import { acceptsSourceFile } from './monster-spawns.js?v=maps-4';
import { isMapNameTable, isMapBitmap } from './map-data.js?v=maps-4';
import { download } from './shared.js';
import { textEncodings } from './text-decoder.js';
const $ = window.jQuery;
let files = [], tables = null, worker = null;
const fileEncodings = new Map();
const fileKey = file => file.webkitRelativePath || file.name;
const exports = [
  { table:'itemDATA', file:'item-data.js', button:'#export-items', count:'#item-count' },
  { table:'monsterDATA', file:'monster-data.js', button:'#export-monsters', count:'#monster-count' },
  { table:'mapDATA', file:'map-data.js', button:'#export-maps', count:'#map-count' }
];
const defaultEncoding = $('#encoding').empty();
for (const [value,label] of textEncodings) defaultEncoding.append($('<option>').val(value).text(label));
function invalidate() {
  tables = null; $('#export-items,#export-monsters,#export-maps,#export-data-zip').prop('disabled',true);
  $('#item-count,#monster-count,#map-count').text('0');
}
function renderFiles() {
  const list = $('#source-list').empty();
  files.forEach((file,i)=>{
    const bitmap = isMapBitmap(fileKey(file));
    const row = $('<li>').addClass('source-row');
    $('<span>').addClass('muted').text(String(i+1).padStart(2,'0')).appendTo(row);
    $('<span>').addClass('file-name').text(file.webkitRelativePath || file.name).append($('<small>').text(`${(file.size/1024).toFixed(1)} KB${bitmap ? ' · Map BMP · filename only' : isMapNameTable(fileKey(file)) ? ' · Map codes' : isCardIllustrationTable(fileKey(file)) ? ' · Auto keeps legacy Western filenames':''}`)).appendTo(row);
    if (!bitmap) {
      const encoding = $('<select>').addClass('file-encoding').attr('aria-label',`Encoding for ${fileKey(file)}`).append($('<option>').val('').text('Use default'));
      for (const [value,label] of textEncodings) encoding.append($('<option>').val(value).text(label));
      encoding.val(fileEncodings.get(fileKey(file)) || '').on('change',()=>{fileEncodings.set(fileKey(file),encoding.val());invalidate();}).appendTo(row);
    }
    for (const [label,offset] of [['↑',-1],['↓',1]]) $('<button>').text(label).attr('aria-label',`Move ${file.name} ${offset < 0 ? 'up':'down'}`).prop('disabled',i+offset < 0 || i+offset >= files.length).on('click',()=>{[files[i],files[i+offset]]=[files[i+offset],files[i]];invalidate();renderFiles();}).appendTo(row);
    $('<button>').text('×').attr('aria-label',`Remove ${file.name}`).on('click',()=>{files.splice(i,1);invalidate();renderFiles();}).appendTo(row);
    list.append(row);
  });
  $('#file-count').text(`${files.length} files selected`); $('#build').prop('disabled',!files.length);
}
$('#data-files,#data-folder').on('change',function(){
  invalidate();
  const selected = Array.from(this.files);
  const incoming = selected.filter(f=>acceptsSourceFile(f, this.id === 'data-folder'));
  const map = new Map(files.map(f=>[f.webkitRelativePath || f.name,f]));
  for (const file of incoming) map.set(file.webkitRelativePath || file.name,file);
  files = Array.from(map.values()).sort((a,b)=>Number(/(?:^|[\\/])import(?:[\\/]|$)/i.test(a.webkitRelativePath))-Number(/(?:^|[\\/])import(?:[\\/]|$)/i.test(b.webkitRelativePath)));
  $('#build-status').text(`Review the file order, then build.${selected.length > incoming.length ? ` ${selected.length-incoming.length} unrelated or Pre-Renewal files excluded.`:''}`); renderFiles(); this.value = '';
});
$('#clear-files').on('click',()=>{files=[];fileEncodings.clear();invalidate();renderFiles();$('#build-status').text('Select files to begin.');});
$('#encoding').on('change',invalidate);
function busy(value) { $('#data-files,#data-folder,#encoding,#clear-files,#source-list button,#source-list select').prop('disabled',value); if(!value)renderFiles(); $('#build').prop('disabled',value || !files.length); }
$('#build').on('click',()=>{
  invalidate();
  if(files.reduce((sum,file)=>sum+file.size,0)>256*1024*1024){$('#build-status').text('Select less than 256 MB of source files per build.');return;}
  busy(true); $('#import-report').removeClass('error').empty().text('Reading your files…');$('#build-status').text('Building data tables…');
  worker?.terminate(); worker = new Worker('assets/data-worker.js?v=maps-4',{type:'module'});
  worker.onmessage = ({data})=>{
    if (data.type === 'progress') { $('#build-status').text(`Reading ${data.done} of ${data.total} files…`); return; }
    busy(false); worker.terminate(); worker=null;
    const report = $('#import-report').empty();
    if (data.type === 'errors') {
      $('#build-status').text('Build stopped. Fix or remove the files listed below.');
      const list = $('<ul>').addClass('error').appendTo(report); data.errors.forEach(e=>$('<li>').text(e).appendTo(list));
      for(const decoded of data.decoding || [])for(const warning of decoded.warnings)$('<p>').text(`${decoded.name}: ${warning}`).appendTo(report);
      return;
    }
    tables = data.tables;
    for (const entry of exports) {
      const count = Object.keys(tables[entry.table]).length;
      $(entry.count).text(count.toLocaleString()); $(entry.button).prop('disabled',!count);
    }
    const hasData = exports.some(entry => Object.keys(tables[entry.table]).length);
    $('#export-data-zip').prop('disabled',!hasData);
    $('#build-status').text(hasData ? 'Data tables are ready.' : 'No records found. Review the import report.');
    $('<p>').addClass('success').text(`Built ${Object.keys(tables.itemDATA).length} items, ${Object.keys(tables.monsterDATA).length} monsters, and ${Object.keys(tables.mapDATA).length} maps.`).appendTo(report);
    if (Object.keys(tables.mapDATA).length) $('<p>').text('Map names use the same map code as their ID, without the file extension. BMP image paths are relative to map/; copy the images to your website separately.').appendTo(report);
    if (data.decoding?.length) {
      const encodingReport = $('<details>').append($('<summary>').text('File encodings used')).appendTo(report);
      const encodingList = $('<ul>').appendTo(encodingReport);
      for(const decoded of data.decoding)$('<li>').text(`${decoded.name}: ${decoded.encoding}`).appendTo(encodingList);
    }
    const list = $('<ul>').appendTo(report); tables.warnings.forEach(w=>$('<li>').text(w).appendTo(list));
    if (!tables.warnings.length) $('<p>').text('No import warnings.').appendTo(report);
  };
  worker.onerror = (e)=>{busy(false);$('#build-status').text('Import failed.');$('#import-report').text(e.message || 'Could not start the importer. Serve this project through PHP/HTTP.').addClass('error');worker?.terminate();worker=null;};
  worker.postMessage({files,encoding:$('#encoding').val(),fileEncodings:files.map(file=>fileEncodings.get(fileKey(file)) || '')});
});
for (const entry of exports) $(entry.button).on('click',()=>{
  if (tables) download(javascriptTable(entry.table,tables[entry.table]),entry.file,'text/javascript');
});
$('#export-data-zip').on('click',()=>{
  if (!tables) return;
  const enc = new TextEncoder();
  const archive = Object.fromEntries(exports.filter(entry => Object.keys(tables[entry.table]).length).map(entry => [entry.file,enc.encode(javascriptTable(entry.table,tables[entry.table]))]));
  archive['import-report.json'] = enc.encode(JSON.stringify({mode:tables.mode,warnings:tables.warnings},null,2));
  download(fflate.zipSync(archive),'ragnarok-data.zip','application/zip');
});
