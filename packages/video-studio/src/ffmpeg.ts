import { spawn } from 'node:child_process';

export interface RunOptions {
  cwd?: string;
  /** Called with each stderr chunk (FFmpeg writes progress there). */
  onStderr?: (chunk: string) => void;
}

/** Run a command, resolving with stdout. Rejects with the tail of stderr on a non-zero exit. */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => {
      const s = d.toString();
      stderr += s;
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
      opts.onStderr?.(s);
    });
    child.on('error', (err) => reject(new Error(`Cannot start "${cmd}": ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else
        reject(
          new Error(`${cmd} exited with code ${code}\n${stderr.split('\n').slice(-25).join('\n')}`),
        );
    });
  });
}

export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

/** Media duration in seconds. */
export async function probeDuration(file: string): Promise<number> {
  const out = await run(FFPROBE, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=nw=1:nk=1',
    file,
  ]);
  const d = parseFloat(out.trim());
  if (!Number.isFinite(d)) throw new Error(`Could not read duration of ${file}`);
  return d;
}

export async function commandExists(cmd: string, versionArg = '-version'): Promise<boolean> {
  try {
    await run(cmd, [versionArg]);
    return true;
  } catch {
    return false;
  }
}

/** Format seconds for FFmpeg / filters with fixed precision (avoids exponent notation). */
export function sec(n: number): string {
  return n.toFixed(3);
}
