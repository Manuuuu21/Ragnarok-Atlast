// Capture entries while the drop event still has access to its data transfer.
// Folder paths travel separately from File objects because structured cloning
// does not preserve properties added to a File before sending it to a worker.
export async function collectDroppedSources(dataTransfer) {
  const items = Array.from(dataTransfer.items || []).filter(item => item.kind === 'file');
  const roots = items.length
    ? items.map(item => ({ entry: item.webkitGetAsEntry?.() || item.getAsEntry?.(), file: item.getAsFile() }))
    : Array.from(dataTransfer.files || []).map(file => ({ file }));
  const sources = [], errors = [];

  async function visit(entry, parent = '') {
    const path = parent + entry.name;
    try {
      if (entry.isFile) {
        const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
        sources.push({ file, path, folder: !!parent });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        // Browsers may return only one batch (often 100 entries) per call.
        while (true) {
          const children = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
          if (!children.length) break;
          for (const child of children) await visit(child, path + '/');
        }
      }
    } catch (error) {
      errors.push(`${path}: ${error.message || 'Could not read this source.'}`);
    }
  }

  for (const { entry, file } of roots) {
    if (entry) await visit(entry);
    else if (file) sources.push({ file, path: file.webkitRelativePath || file.name, folder: !!file.webkitRelativePath });
    else errors.push('A dropped source could not be read. Try Choose files or Choose folder.');
  }
  sources.sort((a, b) => a.path.localeCompare(b.path));
  return { sources, errors };
}
