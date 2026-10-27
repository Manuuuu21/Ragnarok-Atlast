// One ZIP action for every archive size: write to the selected file when the
// picker is available, or spool to browser-managed disk storage before download.
export async function openZipDestination({ picker = globalThis.showSaveFilePicker, storage = globalThis.navigator?.storage } = {}) {
  if (typeof picker === 'function') {
    try {
      const handle = await picker.call(globalThis, {
        suggestedName: 'grf-artwork.zip', types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }]
      });
      return { name: handle.name, writable: await handle.createWritable(), temporary: false, discard: async () => {} };
    } catch (error) {
      // A user cancelling the picker must not start an alternative export.
      if (!['SecurityError', 'NotSupportedError'].includes(error.name)) throw error;
    }
  }
  if (!storage?.getDirectory) throw new Error('This browser cannot save ZIP files to disk. Open this page in Chrome or Edge on localhost or HTTPS.');
  const root = await storage.getDirectory(), cache = await root.getDirectoryHandle('ragnarok-atlas-zip-downloads', { create: true });
  // Completed downloads are kept for a day so their Blob URLs stay readable.
  // Only our own generated temporary ZIPs are eligible for later cleanup.
  for await (const [name, entry] of cache.entries()) {
    const match = name.match(/^export-(\d+)-[a-f0-9-]+\.zip$/);
    if (entry.kind === 'file' && match && Date.now() - Number(match[1]) > 86400000) await cache.removeEntry(name).catch(() => {});
  }
  const name = `export-${Date.now()}-${crypto.randomUUID()}.zip`, handle = await cache.getFileHandle(name, { create: true });
  const discard = () => cache.removeEntry(name).catch(() => {});
  try {
    return { name: 'grf-artwork.zip', writable: await handle.createWritable(), temporary: true, getFile: () => handle.getFile(), discard };
  } catch (error) { await discard(); throw error; }
}
