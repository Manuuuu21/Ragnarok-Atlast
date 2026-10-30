import { openGrf, grfCategory, planGrfExport, readGrfEntry } from './grf-core.js?v=5';
import { headgearEntry, planHeadgearSprites, extractHeadgearSprites } from './headgear-extraction.js?v=4';
import { parseSpr, parseAct } from './formats.js';
import { encodeGif } from './renderer.js';

let archive, plan, spritePlan, acknowledge;
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
      archive = await openGrf(data.file, data.encoding, path => grfCategory(path) || headgearEntry(path));
      plan = planGrfExport(archive);
      spritePlan = null;
      try {
        spritePlan = await planHeadgearSprites(archive);
        plan.counts.sprite = spritePlan.pairs;
        plan.total += spritePlan.pairs;
      } catch (error) { plan.problems.push(`sprite/: ${error.message}`); }
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
      if (spritePlan) {
        let destinationFailed = false, spriteResult;
        try {
          spriteResult = await extractHeadgearSprites(archive, async pair => {
            self.postMessage({ type: 'progress', done: counts.sprite, total: plan.total, message: `Extracting sprite/${pair.path}` });
            // Numeric output paths are portable. Never publish a catalog that
            // references a skipped, renamed, or incompletely written pair.
            try {
              for (const extension of ['act', 'spr']) {
                const path = `sprite/${pair.path}.${extension}`;
                if (await save(path, pair[extension]) !== path) throw new Error(`Could not save ${path} with its catalog filename.`);
              }
            } catch (error) { destinationFailed = true; throw error; }
            counts.sprite++;
            return pair.path;
          }, () => {}, readGrfEntry, spritePlan);
        } catch (error) {
          if (destinationFailed) throw error;
          // Only source failures may leave sprite/ unavailable while the other
          // artwork still exports. Destination errors must abort the export.
          problems.push(`sprite/: ${error.message}`);
        }
        if (spriteResult) {
          problems.push(...spriteResult.report.problems);
          await emitFile('sprite/manifest.json', new TextEncoder().encode(JSON.stringify(spriteResult.manifest, null, 2)));
          await emitFile('sprite/extraction-report.json', new TextEncoder().encode(JSON.stringify(spriteResult.report, null, 2)));
        }
        done = plan.counts.sprite;
      }
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
