import { tableJSON } from './data-core.js?v=auto-save-1';

// Save separately so large item exports do not duplicate all three tables in
// one request. Report each result, including any partial success.
export async function saveTables(tables, entries, token, onProgress = () => {}) {
  const saved = [], failed = [];
  for (const entry of entries) {
    if (!Object.keys(tables[entry.table]).length) continue;
    onProgress(entry.file);
    try {
      const response = await fetch(`save-data.php?table=${encodeURIComponent(entry.table)}`, {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Builder-Token': token },
        body: tableJSON(tables[entry.table])
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.saved !== entry.file) {
        throw new Error(result?.error || `The server could not confirm the save (HTTP ${response.status}).`);
      }
      saved.push(entry.file);
    } catch (error) {
      failed.push({ file: entry.file, message: error.message || 'The save request failed.' });
    }
  }
  return { saved, failed };
}
