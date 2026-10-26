import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

/** sha256 of strings / numbers / objects, in order. */
export function hashOf(...parts: unknown[]): string {
  const h = createHash('sha256');
  for (const p of parts) {
    h.update(typeof p === 'string' ? p : JSON.stringify(p));
    h.update('\u0000');
  }
  return h.digest('hex');
}

/** sha256 of a file's bytes (streamed). */
export function hashFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')));
  });
}

/**
 * Content-addressed file cache. Entries are written to a temp name and renamed into place,
 * so a crashed or cancelled render never leaves a half-written entry behind.
 * Re-running a job (retry, edited plan, another format) reuses every unchanged piece.
 */
export class FileCache {
  constructor(readonly dir: string) {}

  pathFor(key: string, ext: string): string {
    return path.join(this.dir, key.slice(0, 2), `${key}${ext}`);
  }

  has(key: string, ext: string): boolean {
    return existsSync(this.pathFor(key, ext));
  }

  async readText(key: string, ext: string): Promise<string | null> {
    try {
      return await fs.readFile(this.pathFor(key, ext), 'utf8');
    } catch {
      return null;
    }
  }

  async writeText(key: string, ext: string, content: string): Promise<string> {
    const final = this.pathFor(key, ext);
    const tmp = await this.tempPath(key, ext);
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, final);
    return final;
  }

  /** Produce an entry with `make(tmpPath)` unless it already exists. Returns the entry path. */
  async getOrCreate(
    key: string,
    ext: string,
    make: (tmpPath: string) => Promise<void>,
  ): Promise<string> {
    const final = this.pathFor(key, ext);
    if (existsSync(final)) return final;
    const tmp = await this.tempPath(key, ext);
    try {
      await make(tmp);
      await fs.rename(tmp, final);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
    return final;
  }

  /** Store an existing file (copied) under a key. */
  async putFile(key: string, ext: string, source: string): Promise<string> {
    return this.getOrCreate(key, ext, (tmp) => fs.copyFile(source, tmp));
  }

  private async tempPath(key: string, ext: string): Promise<string> {
    const dir = path.join(this.dir, key.slice(0, 2));
    await fs.mkdir(dir, { recursive: true });
    // Keep the real extension last: FFmpeg picks the output format from it.
    return path.join(dir, `${key}.tmp-${randomBytes(4).toString('hex')}${ext}`);
  }
}
