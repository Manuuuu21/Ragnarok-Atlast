import { javascriptTable, isCardIllustrationTable } from './data-core.js?v=upload-checklist-1';
import { saveTables } from './save-tables.js?v=auto-save-1';
import { isDirectSaveEnabled } from './settings.js?v=direct-save-1';
import { acceptsSourceFile } from './monster-spawns.js?v=upload-checklist-1';
import { inspectUploads, missingUploadWarnings } from './upload-checklist.js?v=upload-checklist-2';
import { isMapNameTable, isMapBitmap } from './map-data.js?v=maps-4';
import { download } from './shared.js';
import { textEncodings } from './text-decoder.js';
import { collectDroppedSources } from './source-drop.js?v=drop-1';
const $ = window.jQuery;
let files = [], tables = null, worker = null, parsedChecklist = null;
let isBusy = false, dragDepth = 0;
const fileEncodings = new Map();
const droppedPaths = new WeakMap();
const fileKey = file => droppedPaths.get(file) || file.webkitRelativePath || file.name;
const sourceDescriptors = () => files.map(file => ({ name: file.name, webkitRelativePath: fileKey(file) }));
const uploadZone = document.querySelector('#source-drop-zone');
const uploadStatus = document.querySelector('#source-upload-status');
const exports = [
  { table:'itemDATA', file:'item-data.js', button:'#export-items', count:'#item-count' },
  { table:'monsterDATA', file:'monster-data.js', button:'#export-monsters', count:'#monster-count' },
  { table:'mapDATA', file:'map-data.js', button:'#export-maps', count:'#map-count' }
];
const defaultEncoding = $('#encoding').empty();
for (const [value,label] of textEncodings) defaultEncoding.append($('<option>').val(value).text(label));
function invalidate() {
  parsedChecklist = null;
  tables = null; $('#export-items,#export-monsters,#export-maps,#export-data-zip').prop('disabled',true);
  $('#item-count,#monster-count,#map-count').text('0');
}
function renderUploadChecklist() {
  const checklist = parsedChecklist || inspectUploads(sourceDescriptors());
  const active = checklist.filter(group => group.active);
  const missing = active.flatMap(group => group.missing);
  const guideCount = missing.filter(source => !source.optional).length;
  const optionalCount = missing.length - guideCount;
  let summary = 'Select files to check for missing uploads.';
  if (files.length) {
    if (!active.length) summary = 'No guide filenames detected. Custom sources will also be checked during the build.';
    else if (guideCount) summary = `${guideCount} guide file${guideCount === 1 ? '' : 's'} missing for selected data.${optionalCount ? ` ${optionalCount} optional source${optionalCount === 1 ? '' : 's'} also not selected.` : ''}`;
    else if (optionalCount) summary = `Guide files selected. ${optionalCount} optional source${optionalCount === 1 ? '' : 's'} not selected.`;
    else summary = 'Guide sources selected for your chosen data. Build to validate their contents.';
  }
  $('#upload-checklist').toggleClass('has-missing',missing.length > 0);
  // Updating this short live region only when its text changes avoids repeated
  // announcements when the file order changes or a build finishes.
  if ($('#upload-checklist-summary').text() !== summary) $('#upload-checklist-summary').text(summary);
  const container = $('#upload-checklist-groups').empty();
  for (const group of checklist) {
    const section = $('<details>').prop('open',group.active).appendTo(container);
    $('<summary>').append($('<strong>').text(group.output), $('<span>').text(group.active ? `${group.sources.filter(source => source.present).length}/${group.sources.length} guide sources selected` : 'Not selected')).appendTo(section);
    const list = $('<ul>').appendTo(section);
    for (const source of group.sources) {
      let state = group.active ? (source.optional ? 'Optional — not selected' : 'Missing') : 'Not selected';
      if (source.present) state = source.alternativeCount ? `Alternative selected (${source.alternativeCount} BMP${source.alternativeCount === 1 ? '' : 's'})` : source.id === 'spawns' ? `${source.count} spawn TXT file${source.count === 1 ? '' : 's'} selected` : 'Selected';
      const row = $('<li>').toggleClass('is-selected',source.present).toggleClass('is-missing',group.active && !source.present).appendTo(list);
      $('<div>').addClass('checklist-file').append($('<code>').text(source.label), $('<span>').addClass('checklist-state').text(state)).appendTo(row);
      $('<small>').text(`${source.optional ? 'Optional. ' : ''}${source.help}`).appendTo(row);
    }
  }
}
function renderFiles() {
  const list = $('#source-list').empty();
  files.forEach((file,i)=>{
    const bitmap = isMapBitmap(fileKey(file));
    const row = $('<li>').addClass('source-row');
    $('<span>').addClass('muted').text(String(i+1).padStart(2,'0')).appendTo(row);
    $('<span>').addClass('file-name').text(fileKey(file)).append($('<small>').text(`${(file.size/1024).toFixed(1)} KB${bitmap ? ' · Map BMP · filename only' : isMapNameTable(fileKey(file)) ? ' · Map codes' : isCardIllustrationTable(fileKey(file)) ? ' · Auto keeps legacy Western filenames':''}`)).appendTo(row);
    if (!bitmap) {
      const encoding = $('<select>').addClass('file-encoding').attr('aria-label',`Encoding for ${fileKey(file)}`).append($('<option>').val('').text('Use default'));
      for (const [value,label] of textEncodings) encoding.append($('<option>').val(value).text(label));
      encoding.val(fileEncodings.get(fileKey(file)) || '').on('change',()=>{fileEncodings.set(fileKey(file),encoding.val());invalidate();renderUploadChecklist();}).appendTo(row);
    }
    for (const [label,offset] of [['↑',-1],['↓',1]]) $('<button>').text(label).attr('aria-label',`Move ${file.name} ${offset < 0 ? 'up':'down'}`).prop('disabled',i+offset < 0 || i+offset >= files.length).on('click',()=>{[files[i],files[i+offset]]=[files[i+offset],files[i]];invalidate();renderFiles();}).appendTo(row);
    $('<button>').text('×').attr('aria-label',`Remove ${file.name}`).on('click',()=>{files.splice(i,1);invalidate();renderFiles();}).appendTo(row);
    list.append(row);
  });
  $('#file-count').text(`${files.length} file${files.length === 1 ? '' : 's'} selected`); $('#build').prop('disabled',!files.length);
  renderUploadChecklist();
}
function addSources(selected) {
  const incoming = selected.filter(({ file, path, folder }) => acceptsSourceFile({ name: file.name, webkitRelativePath: path }, folder));
  const excluded = selected.length - incoming.length;
  const summary = `${incoming.length ? `${incoming.length} source file${incoming.length === 1 ? '' : 's'} accepted.` : 'No supported source files found.'}${excluded ? ` ${excluded} unrelated or Pre-Renewal files excluded.` : ''}`;
  uploadStatus.textContent = summary;
  if (!incoming.length) return;
  invalidate();
  const map = new Map(files.map(file => [fileKey(file), file]));
  for (const { file, path } of incoming) { droppedPaths.set(file, path); map.set(path, file); }
  files = Array.from(map.values()).sort((a,b)=>Number(/(?:^|[\\/])import(?:[\\/]|$)/i.test(fileKey(a)))-Number(/(?:^|[\\/])import(?:[\\/]|$)/i.test(fileKey(b))));
  $('#build-status').text(`Review the file order, then build.${excluded ? ` ${excluded} unrelated or Pre-Renewal files excluded.` : ''}`);
  renderFiles();
}
$('#data-files,#data-folder').on('change',function(){
  if (!isBusy) addSources(Array.from(this.files, file => ({ file, path: file.webkitRelativePath || file.name, folder: this.id === 'data-folder' })));
  this.value = '';
});
const hasFileDrag = event => Array.from(event.dataTransfer?.types || []).includes('Files');
function resetDrag() { dragDepth = 0; uploadZone.classList.remove('is-dragover'); }
uploadZone.addEventListener('dragenter', event => {
  if (!hasFileDrag(event)) return;
  event.preventDefault();
  if (!isBusy) { dragDepth++; uploadZone.classList.add('is-dragover'); }
});
uploadZone.addEventListener('dragover', event => {
  if (!hasFileDrag(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = isBusy ? 'none' : 'copy';
});
uploadZone.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) resetDrag();
});
uploadZone.addEventListener('drop', async event => {
  if (!hasFileDrag(event)) return;
  event.preventDefault(); event.stopPropagation(); resetDrag();
  if (isBusy) { uploadStatus.textContent = 'Wait for the current import or build to finish before adding files.'; return; }
  busy(true);
  uploadStatus.textContent = 'Reading dropped files and folders…';
  try {
    const { sources, errors } = await collectDroppedSources(event.dataTransfer);
    addSources(sources);
    if (errors.length) uploadStatus.textContent += ` ${errors.length} source${errors.length === 1 ? '' : 's'} could not be read. ${errors.slice(0, 3).join(' ')} Try Choose files or Choose folder for those sources.`;
  } catch (error) {
    uploadStatus.textContent = `Could not read the drop: ${error.message || 'Please try Choose files or Choose folder.'}`;
  } finally { busy(false); }
});
// A missed drop must not navigate away from the builder and lose its work.
document.addEventListener('dragover', event => {
  if (!hasFileDrag(event)) return;
  event.preventDefault();
  if (!uploadZone.contains(event.target)) event.dataTransfer.dropEffect = 'none';
});
document.addEventListener('drop', event => {
  if (!hasFileDrag(event)) return;
  event.preventDefault(); resetDrag();
  uploadStatus.textContent = 'Drop source files or folders inside the upload area.';
});
window.addEventListener('dragend', resetDrag);
window.addEventListener('blur', resetDrag);
$('#clear-files').on('click',()=>{files=[];fileEncodings.clear();invalidate();renderFiles();$('#build-status').text('Select files to begin.');uploadStatus.textContent='Drag files or folders here, or use the buttons above.';});
$('#encoding').on('change',()=>{invalidate();renderUploadChecklist();});
function busy(value) {
  isBusy = value;
  if (value) resetDrag();
  uploadZone.classList.toggle('is-busy', value);
  uploadZone.setAttribute('aria-busy', String(value));
  $('#data-files,#data-folder,#encoding,#clear-files,#source-list button,#source-list select,#save-directly').prop('disabled',value);
  $('#settings-busy').prop('hidden',!value);
  if(!value)renderFiles();
  $('#build').prop('disabled',value || !files.length);
}
$('#build').on('click',()=>{
  invalidate();
  if(files.reduce((sum,file)=>sum+file.size,0)>256*1024*1024){$('#build-status').text('Select less than 256 MB of source files per build.');return;}
  busy(true); $('#import-report').removeClass('error').empty().text('Reading your files…');$('#build-status').text('Building data tables…');
  worker?.terminate(); worker = new Worker('assets/data-worker.js?v=drop-1',{type:'module'});
  worker.onmessage = async ({data})=>{
    if (data.type === 'progress') { $('#build-status').text(`Reading ${data.done} of ${data.total} files…`); return; }
    worker.terminate(); worker=null;
    parsedChecklist = data.checklist || null;
    renderUploadChecklist();
    const report = $('#import-report').empty();
    if (data.type === 'errors') {
      busy(false);
      $('#build-status').text('Build stopped. Fix or remove the files listed below.');
      const list = $('<ul>').addClass('error').appendTo(report); data.errors.forEach(e=>$('<li>').text(e).appendTo(list));
      for (const warning of missingUploadWarnings(parsedChecklist || inspectUploads(sourceDescriptors()))) $('<p>').text(warning).appendTo(report);
      for(const decoded of data.decoding || [])for(const warning of decoded.warnings)$('<p>').text(`${decoded.name}: ${warning}`).appendTo(report);
      return;
    }
    tables = data.tables;
    const uploadReminder = missingUploadWarnings(parsedChecklist || inspectUploads(sourceDescriptors())).length ? ' Review missing uploads in the checklist.' : '';
    for (const entry of exports) {
      const count = Object.keys(tables[entry.table]).length;
      $(entry.count).text(count.toLocaleString()); $(entry.button).prop('disabled',!count);
    }
    const hasData = exports.some(entry => Object.keys(tables[entry.table]).length);
    $('#export-data-zip').prop('disabled',!hasData);
    $('#build-status').text((hasData ? 'Data tables are ready.' : 'No records found. Review the import report.') + uploadReminder);
    $('<p>').addClass('success').text(`Built ${Object.keys(tables.itemDATA).length} items, ${Object.keys(tables.monsterDATA).length} monsters, and ${Object.keys(tables.mapDATA).length} maps.`).appendTo(report);
    if (Object.keys(tables.mapDATA).length) $('<p>').text('Map names use the same map code as their ID, without the file extension. BMP image paths are relative to map/; copy the images to your website separately.').appendTo(report);
    if (data.decoding?.length) {
      const encodingReport = $('<details>').append($('<summary>').text('File encodings used')).appendTo(report);
      const encodingList = $('<ul>').appendTo(encodingReport);
      for(const decoded of data.decoding)$('<li>').text(`${decoded.name}: ${decoded.encoding}`).appendTo(encodingList);
    }
    const list = $('<ul>').appendTo(report); tables.warnings.forEach(w=>$('<li>').text(w).appendTo(list));
    if (!tables.warnings.length) $('<p>').text('No import warnings.').appendTo(report);
    try {
      if (hasData && !isDirectSaveEnabled()) {
        $('<p>').text('Direct saving is disabled. No files were written to search-app/lib/. Download your generated tables using the export buttons.').appendTo(report);
        $('#build-status').text('Build complete. Direct saving is disabled. Downloads are available.' + uploadReminder);
      } else if (hasData) {
        const result = await saveTables(tables, exports, $('#builder-save-token').val(), filename => {
          $('#build-status').text(`Saving ${filename} to search-app/lib/…`);
        });
        if (result.saved.length) $('<p>').addClass('success').text(`Saved to search-app/lib/: ${result.saved.join(', ')}.`).appendTo(report);
        for (const failure of result.failed) $('<p>').addClass('error').text(`${failure.file} was not saved: ${failure.message}`).appendTo(report);
        $('#build-status').text((result.failed.length ? 'Build complete, but some files could not be saved. Downloads are available; see the import report.' : 'Build complete. Saved to search-app/lib/. Downloads are also available.') + uploadReminder);
        if (!result.failed.length) $('<p>').append($('<a>').attr({href:'search-app/index.html',target:'_blank',rel:'noopener'}).text('Open Data Search')).appendTo(report);
      }
    } catch (error) {
      $('#build-status').text('Build complete, but automatic saving failed. Downloads are available.');
      $('<p>').addClass('error').text(error.message).appendTo(report);
    } finally {
      busy(false);
    }
  };
  worker.onerror = (e)=>{busy(false);$('#build-status').text('Import failed.');$('#import-report').text(e.message || 'Could not start the importer. Serve this project through PHP/HTTP.').addClass('error');worker?.terminate();worker=null;};
  worker.postMessage({files,filePaths:files.map(fileKey),encoding:$('#encoding').val(),fileEncodings:files.map(file=>fileEncodings.get(fileKey(file)) || '')});
});
renderUploadChecklist();
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
