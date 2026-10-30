import { ZipWriter, Uint8ArrayReader } from './vendor/zip-native-2.20.0.js';
import { OUTPUT_FOLDERS, safeGrfPath } from './grf-core.js?v=5';

// A single archive is written incrementally. The producer waits for add() before
// sending the next file, so only the current asset and ZIP directory metadata are
// retained. FileSystemWritableFileStream commits only after successful close().
export class ZipExport {
  constructor(writable) {
    this.destination = writable.getWriter();
    this.controller = new AbortController();
    this.state = 'open';
    this.pending = Promise.resolve();
    this.bytesWritten = 0;
    this.abortPromise = null;
    const output = new WritableStream({
      write: async bytes => {
        this.controller.signal.throwIfAborted();
        await this.destination.write(bytes);
        this.bytesWritten += bytes.byteLength;
      }
    });
    this.zip = new ZipWriter(output, {
      zip64: true, bufferedWrite: false, useWebWorkers: false,
      level: 1, extendedTimestamp: false, msDosCompatible: true
    });
  }

  async initialize() {
    for (const folder of OUTPUT_FOLDERS) await this.add(`${folder}/`, new Uint8Array());
  }

  async add(path, bytes) {
    this.controller.signal.throwIfAborted();
    if (this.state !== 'open') throw new Error('ZIP export is no longer accepting files.');
    const directory = path.endsWith('/');
    const name = safeGrfPath(directory ? path.slice(0, -1) : path) + (directory ? '/' : '');
    this.pending = this.zip.add(name, directory ? undefined : new Uint8ArrayReader(bytes), {
      directory, signal: this.controller.signal,
      // GIF is already compressed; recompressing it adds work for little gain.
      level: directory || /\.gif$/i.test(name) ? 0 : 1
    });
    await this.pending;
  }

  async close(onProgress = () => {}, onCommit = () => {}) {
    this.controller.signal.throwIfAborted();
    if (this.state !== 'open') throw new Error('ZIP export has already finished.');
    this.state = 'closing';
    this.pending = this.zip.close(undefined, {
      zip64: true,
      onprogress: async (done, total) => {
        this.controller.signal.throwIfAborted();
        if (done % 256 === 0 || done === total) {
          onProgress(done, total);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    });
    await this.pending;
    this.controller.signal.throwIfAborted();
    onCommit();
    this.state = 'committing';
    this.pending = this.destination.close();
    try { await this.pending; }
    catch (error) { this.state = 'failed'; throw error; }
    this.state = 'closed';
    this.destination.releaseLock();
    this.zip = null;
  }

  abort() {
    if (this.state === 'closed') return Promise.resolve();
    if (this.state === 'committing') return this.pending;
    if (this.abortPromise) return this.abortPromise;
    this.controller.abort(new DOMException('ZIP export cancelled.', 'AbortError'));
    this.state = 'aborted';
    this.abortPromise = (async () => {
      await this.pending.catch(() => {});
      try { await this.destination.abort(); }
      finally { this.destination.releaseLock(); this.zip = null; }
    })();
    return this.abortPromise;
  }
}
