import { openGrf, planGrfExport, readGrfEntry } from './grf-core.js?v=3';
import { parseSpr, parseAct } from './formats.js';
import { encodeGif } from './renderer.js';

let archive, plan, acknowledge;
function emitFile(path, bytes) {
  return new Promise((resolve, reject) => {
    acknowledge = { resolve, reject };
    self.postMessage({ type: 'file', path, bytes }, [bytes.buffer]);
  });
}

self.onmessage = async ({ data }) => {
  if (data.type === 'ack') {
    const pending = acknowledge; acknowledge = null;
    if (data.error) pending?.reject(new Error(data.error)); else pending?.resolve(data.result || {});
    return;
  }
  try {
    if (data.type === 'open') {
      archive = await openGrf(data.file, data.encoding);
      plan = planGrfExport(archive);
      self.postMessage({ type: 'ready', counts: plan.counts, total: plan.total, problems: plan.problems, entries: archive.count });
    } else if (data.type === 'export') {
      if (!archive || !plan) throw new Error('Choose a GRF archive first.');
      const opts = data.options;
      if (![1, 2, 3, 4].includes(opts.scale) || ![0.5, 1, 2].includes(opts.speed) || ![null, '#ffffff', '#17232c'].includes(opts.background) || !['first', 'selected'].includes(opts.mode) || !Number.isInteger(opts.action) || opts.action < 0 || opts.action > 999) throw new Error('Invalid GIF export settings.');
      const problems = [...plan.problems], manifest = [], counts = Object.fromEntries(Object.keys(plan.counts).map(key => [key, 0]));
      async function save(path, bytes) {
        const result = await emitFile(path, bytes);
        if (result.skipped) { problems.push(result.skipped); return null; }
        if (result.warning) problems.push(result.warning);
        return result.path || path;
      }
      let done = 0;
      for (const entry of plan.textures) {
        self.postMessage({ type: 'progress', done, total: plan.total, message: `Extracting ${entry.output}` });
        let bytes;
        try { bytes = await readGrfEntry(archive, entry); }
        catch (error) { problems.push(`${entry.path}: ${error.message}`); done++; continue; }
        // Destination failures stop the entire export; they are not asset errors.
        if (await save(entry.output, bytes)) counts[entry.folder]++;
        done++;
      }
      for (const pair of plan.pairs) {
        let result, index;
        try {
          const spr = parseSpr((await readGrfEntry(archive, pair.spr)).buffer);
          const act = parseAct((await readGrfEntry(archive, pair.act)).buffer);
          index = opts.mode === 'first' ? act.actions.findIndex(action => action.frames.length) : opts.action;
          result = await encodeGif(spr, act.actions[index], opts, (frame, totalFrames) => self.postMessage({ type: 'progress', done, total: plan.total, message: `${pair.name}: frame ${frame}/${totalFrames}` }));
        } catch (error) { problems.push(`${pair.path}: ${error.message}`); done++; continue; }
        const { bytes, ...metadata } = result;
        const file = await save(pair.output, bytes);
        if (file) { manifest.push({ name: pair.name, source: pair.path, action: index, file, ...metadata }); counts.monster++; }
        done++;
      }
      const successful = Object.values(counts).reduce((a, b) => a + b, 0);
      const report = [`Archive: ${archive.file.name}`, `GRF version: ${archive.version === 0x300 ? '3.0 (Event Horizon)' : '2.0'}`, `Filename encoding: ${archive.encoding}`, ...Object.entries(counts).map(([folder, count]) => `${folder}/: ${count} exported`), '', ...problems];
      if (!problems.length) report.push('All selected resources exported successfully.');
      await emitFile('sprite-manifest.json', new TextEncoder().encode(JSON.stringify(manifest, null, 2)));
      await emitFile('export-report.txt', new TextEncoder().encode(report.join('\n')));
      self.postMessage({ type: 'done', counts, successful, problems });
    }
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
