import { spawn } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RunOptions {
  cwd?: string;
  /** Called with each stderr chunk (FFmpeg writes progress there). */
  onStderr?: (chunk: string) => void;
  /** Kill the command after this many ms (default VIDEO_STUDIO_CMD_TIMEOUT_MS or 10 minutes). */
  timeoutMs?: number;
  /** Abort the command (e.g. the job was cancelled). Defaults to the current job's signal. */
  signal?: AbortSignal;
}

export class CancelledError extends Error {
  constructor(message = 'Cancelled') {
    super(message);
    this.name = 'CancelledError';
  }
}

export class CommandTimeoutError extends Error {
  constructor(cmd: string, ms: number) {
    super(`${cmd} took longer than ${Math.round(ms / 1000)}s and was stopped`);
    this.name = 'CommandTimeoutError';
  }
}

/** Per-job context so every external command of a job can be cancelled together. */
const jobContext = new AsyncLocalStorage<{ signal?: AbortSignal }>();

/** Run `fn` so that every command it starts is killed when `signal` aborts. */
export function withSignal<T>(signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
  return jobContext.run({ signal }, fn);
}

export function throwIfCancelled(signal = jobContext.getStore()?.signal): void {
  if (signal?.aborted) throw new CancelledError();
}

function defaultTimeout(): number {
  const v = Number(process.env.VIDEO_STUDIO_CMD_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 10 * 60_000;
}

/** Run a command, resolving with stdout. Rejects with the tail of stderr on a non-zero exit. */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<string> {
  const signal = opts.signal ?? jobContext.getStore()?.signal;
  const timeoutMs = opts.timeoutMs ?? defaultTimeout();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new CancelledError());
    const child = spawn(cmd, args, { cwd: opts.cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let killedFor: Error | null = null;
    const kill = (reason: Error) => {
      if (killedFor) return;
      killedFor = reason;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => kill(new CommandTimeoutError(cmd, timeoutMs)), timeoutMs);
    const onAbort = () => kill(new CancelledError());
    signal?.addEventListener('abort', onAbort, { once: true });
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };

    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => {
      const s = d.toString();
      stderr += s;
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
      opts.onStderr?.(s);
    });
    child.on('error', (err) => {
      cleanup();
      reject(new Error(`Cannot start "${cmd}": ${err.message}`));
    });
    child.on('close', (code) => {
      cleanup();
      if (killedFor) return reject(killedFor);
      if (code === 0) resolve(stdout);
      else
        reject(
          new Error(
            `${cmd} exited with code ${code}\n${stderr
              .split('\n')
              .filter((l) => !/^[a-z_]+=/.test(l)) // drop -progress key=value lines
              .slice(-25)
              .join('\n')}`,
          ),
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
