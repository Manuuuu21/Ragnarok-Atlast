import { OUTPUT_FOLDERS } from './grf-core.js?v=3';
import { ZipExport } from './zip-export.js';
import { FolderExport } from './folder-export.js';
import { openZipDestination } from './zip-destination.js';

const $ = window.jQuery;
let worker = null, busy = false, ready = false, total = 0, job = null;
const settings = '#grf-file,#grf-encoding,#grf-mode,#grf-scale,#grf-speed,#grf-background';
function controls() {
  $(settings).prop('disabled', busy);
  $('#grf-action').prop('disabled', busy || $('#grf-mode').val() !== 'selected');
  $('#grf-save').prop('disabled', busy || !ready || !total || !window.showDirectoryPicker);
  $('#grf-zip').prop('disabled', busy || !ready || !total);
  $('#grf-cancel').prop('hidden', !busy).prop('disabled', job?.zip?.state === 'committing');
}
function status(message) { $('#grf-status').text(message); }
function report(lines) { $('#grf-report').text(lines.length ? lines.join('\n') : 'No issues reported.'); }
async function discard(target) {
  if (!target?.zip) return;
  try { await target.zip.abort(); }
  finally { await target.destination.discard(); }
}
function stop(message) {
  const target = job; job = null;
  worker?.terminate(); worker = null; ready = false; busy = false;
  discard(target).catch(error => report([`Could not discard the unfinished ZIP: ${error.message}`]));
  status(message); controls();
}
$('#grf-mode').on('change', controls);
$('#grf-encoding').on('change', () => {
  stop('Filename encoding changed. Choose your GRF again to rescan.');
  $('#grf-summary').text('Choose archive again');
  for (const folder of OUTPUT_FOLDERS) $(`#grf-count-${folder}`).text('—');
});
$('#grf-file').on('change', function () {
  const file = this.files[0]; this.value = ''; if (!file) return;
  worker?.terminate(); ready = false; busy = true; total = 0; controls();
  $('#grf-progress').val(0); $('#grf-summary').text(file.name); $('#grf-zip-download').prop('hidden', true);
  for (const folder of OUTPUT_FOLDERS) $(`#grf-count-${folder}`).text('—');
  report([]); status('Reading GRF file table…');
  const activeWorker = worker = new Worker('assets/grf-worker.js?v=3', { type: 'module' });
  activeWorker.onerror = event => { if (worker === activeWorker) stop(event.message || 'GRF worker failed.'); };
  activeWorker.onmessage = async ({ data }) => {
    if (worker !== activeWorker) return;
    if (data.type === 'ready') {
      ready = true; busy = false; total = data.total;
      for (const folder of OUTPUT_FOLDERS) {
        const count = data.counts[folder], noun = folder === 'monster' ? 'pair' : 'file';
        $(`#grf-count-${folder}`).text(`${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`);
      }
      report(data.problems);
      status(total ? `${total.toLocaleString()} resources ready from ${data.entries.toLocaleString()} archive entries.` : 'No supported resources found in the requested paths. Check the archive and filename encoding.');
      controls();
    } else if (data.type === 'progress') {
      $('#grf-progress').val(data.total ? data.done / data.total * 100 : 0); status(data.message);
    } else if (data.type === 'file') {
      try {
        const result = await job.write(data.path, data.bytes);
        if (worker === activeWorker) activeWorker.postMessage({ type: 'ack', result });
      } catch (error) {
        if (worker === activeWorker) activeWorker.postMessage({ type: 'ack', error: `${data.path}: ${error.message}` });
      }
    } else if (data.type === 'done') {
      const target = job;
      try {
        let label;
        if (target.zip) {
          status('Finishing ZIP…');
          await target.zip.close(
            (done, entries) => { if (worker === activeWorker) status(`Finishing ZIP: ${done.toLocaleString()}/${entries.toLocaleString()} entries…`); },
            () => { if (worker === activeWorker) { $('#grf-cancel').prop('disabled', true); status('Saving ZIP file…'); } }
          );
          if (worker !== activeWorker) return;
          if (target.destination.temporary) {
            const file = await target.destination.getFile();
            if (worker !== activeWorker) return;
            // A File-backed Blob URL streams browser-managed disk data, without
            // reading the complete ZIP into an ArrayBuffer or JavaScript array.
            const link = $('#grf-zip-download').attr({ href: URL.createObjectURL(file), download: 'grf-artwork.zip' }).prop('hidden', false)[0];
            link.click(); label = 'ZIP ready. The download link is available below.';
          } else label = `Saved ${target.destination.name}.`;
        } else {
          await target.folder.close(); label = target.label;
        }
        if (worker !== activeWorker) return;
        report(data.problems); $('#grf-progress').val(100);
        status(`${data.successful.toLocaleString()} resources exported${data.problems.length ? `; ${data.problems.length} ${data.problems.length === 1 ? 'issue' : 'issues'} listed in the report` : ''}. ${label}`);
      } catch (error) {
        if (worker !== activeWorker) return;
        await discard(target).catch(() => {});
        if (worker === activeWorker) { report([...data.problems, error.message]); status(`Export failed: ${error.message}`); }
      } finally { if (worker === activeWorker) { busy = false; job = null; controls(); } }
    } else if (data.type === 'error') {
      const message = data.message + (job?.zip ? ' The unfinished ZIP will be discarded.' : job?.folder ? ' Files already written remain in the export folder.' : '') + ' Choose the GRF again to retry.';
      report([message]); stop(message);
    }
  };
  activeWorker.postMessage({ type: 'open', file, encoding: $('#grf-encoding').val() });
});

async function newExportFolder(parent) {
  const stem = `grf-artwork-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  for (let suffix = 0; suffix < 1000; suffix++) {
    const name = stem + (suffix ? `-${suffix}` : '');
    try { await parent.getDirectoryHandle(name); }
    catch (error) {
      if (error.name === 'NotFoundError') return parent.getDirectoryHandle(name, { create: true });
      if (error.name !== 'TypeMismatchError') throw error;
    }
  }
  throw new Error('Cannot create a unique export directory.');
}
async function startExport(destination) {
  if (busy || !ready || !total) return;
  const action = Number($('#grf-action').val());
  if (!Number.isInteger(action) || action < 0 || action > 999) { status('Enter an action index from 0 to 999.'); return; }
  busy = true; controls(); $('#grf-progress').val(0); $('#grf-zip-download').prop('hidden', true);
  const activeWorker = worker;
  let target = null;
  try {
    if (destination === 'zip') {
      const output = await openZipDestination();
      if (worker !== activeWorker) { await output.writable.abort(); await output.discard(); return; }
      const zip = new ZipExport(output.writable);
      target = { zip, destination: output, write: (path, bytes) => zip.add(path, bytes) }; job = target;
      await zip.initialize();
    } else {
      const parent = await window.showDirectoryPicker({ mode: 'readwrite' });
      if (worker !== activeWorker) return;
      const root = await newExportFolder(parent);
      if (worker !== activeWorker) return;
      const folder = new FolderExport(root);
      target = { folder, label: `Saved in ${parent.name}/${root.name}/`, write: (path, bytes) => folder.write(path, bytes) }; job = target;
      await folder.initialize();
    }
    if (worker !== activeWorker) return;
    status('Starting extraction…');
    activeWorker.postMessage({ type: 'export', options: { mode: $('#grf-mode').val(), action, scale: Number($('#grf-scale').val()), speed: Number($('#grf-speed').val()), background: $('#grf-background').val() || null } });
  } catch (error) {
    await discard(target).catch(() => {});
    if (worker !== activeWorker) return;
    busy = false; job = null;
    status(error.name === 'AbortError' ? 'Destination selection cancelled.' : error.message); controls();
  }
}
$('#grf-save').on('click', () => startExport('folder'));
$('#grf-zip').on('click', () => startExport('zip'));
$('#grf-cancel').on('click', () => {
  if (job?.zip?.state === 'committing') return;
  stop(`Cancelled.${job?.zip ? ' The unfinished ZIP will be discarded.' : job?.folder ? ' Completed files remain in the export folder.' : ''} Choose a GRF again to restart.`);
});
window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });
controls();
