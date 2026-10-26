import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildAss, buildCaptionCues, WordTiming } from './captions';
import { FileCache, hashFile, hashOf } from './cache';
import { FFMPEG, run, sec, throwIfCancelled } from './ffmpeg';
import { Aspect, EditPlan, Fit, Motion, Quality, SAFE_ZONES, frameSize } from './plan';
import { planSfx, renderSfxTrack } from './sfx';
import { TimedScene, Timeline } from './timeline';

export const FPS = 30;
const ZOOM = 0.12;

/** Ease-in-out progress 0→1 over the clip, as an FFmpeg expression. */
function ease(frames: number): string {
  return `(1-cos(PI*on/${Math.max(1, frames - 1)}))/2`;
}

/** zoompan z/x/y expressions for a camera move. Exported for tests. */
export function motionExpr(motion: Motion, frames: number): { z: string; x: string; y: string } {
  const e = ease(frames);
  const cx = 'iw/2-(iw/zoom/2)';
  const cy = 'ih/2-(ih/zoom/2)';
  const zMax = `${1 + ZOOM}`;
  switch (motion) {
    case 'zoom_in':
      return { z: `1+${ZOOM}*${e}`, x: cx, y: cy };
    case 'zoom_out':
      return { z: `1+${ZOOM}*(1-${e})`, x: cx, y: cy };
    case 'pan_left':
      return { z: zMax, x: `(iw-iw/zoom)*(1-${e})`, y: cy };
    case 'pan_right':
      return { z: zMax, x: `(iw-iw/zoom)*${e}`, y: cy };
    case 'pan_up':
      return { z: zMax, x: cx, y: `(ih-ih/zoom)*(1-${e})` };
    case 'pan_down':
      return { z: zMax, x: cx, y: `(ih-ih/zoom)*${e}` };
    case 'static':
    default:
      return { z: '1', x: '0', y: '0' };
  }
}

function baseFrameFilter(fit: Fit, w: number, h: number): string {
  // Work at 2x so zoompan's whole-pixel steps don't make the motion jitter.
  const W2 = w * 2;
  const H2 = h * 2;
  if (fit === 'cover') {
    return `[0:v]scale=${W2}:${H2}:force_original_aspect_ratio=increase,crop=${W2}:${H2},setsar=1[base]`;
  }
  return [
    `[0:v]split=2[a][b]`,
    `[a]scale=${W2}:${H2}:force_original_aspect_ratio=increase,crop=${W2}:${H2},boxblur=40:2,eq=brightness=-0.08[bg]`,
    `[b]scale=${W2}:${H2}:force_original_aspect_ratio=decrease[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[base]`,
  ].join(';');
}

/** Render one picture into a moving clip of exactly ts.clipLength seconds. */
export async function renderSceneClip(
  image: string,
  plan: EditPlan,
  ts: TimedScene,
  aspect: Aspect,
  outFile: string,
  quality: Quality = 'final',
): Promise<void> {
  const { width: w, height: h } = frameSize(aspect, quality);
  const scene = plan.scenes[ts.index];
  const frames = Math.max(2, Math.round(ts.clipLength * FPS));
  const m = motionExpr(scene.motion, frames);
  const graph = [
    baseFrameFilter(scene.fit, w, h),
    `[base]zoompan=z='${m.z}':x='${m.x}':y='${m.y}':d=${frames}:s=${w}x${h}:fps=${FPS},format=yuv420p,setsar=1[v]`,
  ].join(';');

  await run(FFMPEG, [
    '-y',
    '-v',
    'error',
    '-protocol_whitelist',
    'file',
    '-i',
    image,
    '-filter_complex',
    graph,
    '-map',
    '[v]',
    '-frames:v',
    String(frames),
    '-r',
    String(FPS),
    '-c:v',
    'libx264',
    '-preset',
    quality === 'final' ? 'veryfast' : 'ultrafast',
    '-crf',
    // Intermediate clips are re-encoded once more, so keep them near-lossless.
    quality === 'final' ? '14' : '24',
    '-pix_fmt',
    'yuv420p',
    '-an',
    outFile,
  ]);
}

/**
 * Encoder settings for the delivered file. Final follows YouTube's upload recommendations
 * (H.264 High, closed GOP of half the frame rate, 2 B-frames, 48 kHz AAC, moov atom first);
 * TikTok and Reels accept the same file.
 */
export function encoderArgs(quality: Quality): string[] {
  if (quality === 'preview') {
    return [
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '28',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ar',
      '48000',
      '-movflags',
      '+faststart',
    ];
  }
  return [
    '-c:v',
    'libx264',
    '-profile:v',
    'high',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    '-maxrate',
    '12M',
    '-bufsize',
    '24M',
    '-g',
    String(FPS / 2),
    '-keyint_min',
    String(FPS / 2),
    '-sc_threshold',
    '0',
    '-bf',
    '2',
    '-flags',
    '+cgop',
    '-pix_fmt',
    'yuv420p',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-colorspace',
    'bt709',
    '-c:a',
    'aac',
    '-b:a',
    '320k',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
  ];
}

/** Run async jobs with a concurrency limit. */
async function pool<T>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

export interface RenderInput {
  plan: EditPlan;
  timeline: Timeline;
  images: string[];
  /** Narration file per scene (null for silent scenes). */
  narration: (string | null)[];
  aspect: Aspect;
  output: string;
  workDir: string;
  music?: string;
  /** Font family used for captions; must support Vietnamese. */
  fontName?: string;
  /** Folder with extra .ttf/.otf fonts for captions. */
  fontsDir?: string;
  /** Word timings from the TTS per scene (relative to narration start) for karaoke captions. */
  sceneWords?: (WordTiming[] | undefined)[];
  /** Folder with your own sound effects (whoosh, pop, tick, hit .wav/.mp3) to replace the built-in ones. */
  sfxDir?: string;
  /** preview = half resolution + fast encode (default final). */
  quality?: Quality;
  /** Shade the areas covered by the TikTok/Reels UI (for previews). */
  safeZoneGuides?: boolean;
  /** Reuse rendered scene clips across runs. */
  cache?: FileCache;
  /** Written into the file's metadata. */
  metadata?: Record<string, string>;
  /** 0–1 progress of this render. */
  onProgress?: (fraction: number) => void;
  log?: (msg: string) => void;
}

export function defaultFontName(): string {
  return process.platform === 'win32'
    ? 'Arial'
    : process.platform === 'darwin'
      ? 'Helvetica'
      : 'DejaVu Sans';
}

/** Build the final filter graph: xfade chain + captions + voice/music mix. Exported for tests. */
export function buildFinalGraph(
  input: Pick<RenderInput, 'timeline' | 'narration' | 'music' | 'plan' | 'fontsDir'> & {
    sfxTrack?: string | null;
    /** Shade these UI areas (fractions of the frame) on top of the picture. */
    guides?: { top: number; bottom: number; side: number } | null;
  },
  assFileName: string,
): {
  graph: string;
  voiceInputs: number[];
  musicInput: number | null;
  silenceInput: number;
  sfxInput: number | null;
} {
  const { timeline } = input;
  const n = timeline.scenes.length;
  const parts: string[] = [];

  // --- video: chain clips with xfade
  let last = '[0:v]';
  if (n === 1) {
    parts.push(`[0:v]settb=AVTB,fps=${FPS}[vx]`);
  } else {
    for (let i = 0; i < n; i++) parts.push(`[${i}:v]settb=AVTB,fps=${FPS}[c${i}]`);
    last = '[c0]';
    for (let i = 1; i < n; i++) {
      const prev = timeline.scenes[i - 1];
      const kind = prev.transition === 'cut' ? 'fade' : prev.transition;
      const offset = timeline.scenes[i].start; // == sum of previous scene durations
      const outLabel = i === n - 1 ? '[vx]' : `[x${i}]`;
      parts.push(
        `${last}[c${i}]xfade=transition=${kind}:duration=${sec(prev.transitionDuration)}:offset=${sec(offset)}${outLabel}`,
      );
      last = outLabel;
    }
  }
  const fontsDir = input.fontsDir
    ? `:fontsdir='${input.fontsDir.replace(/\\/g, '/').replace(/:/g, '\\:')}'`
    : '';
  let guides = '';
  if (input.guides) {
    const g = input.guides;
    const shade = 'color=red@0.22:t=fill';
    guides =
      `,drawbox=x=0:y=0:w=iw:h=ih*${g.top}:${shade}` +
      `,drawbox=x=0:y=ih*${(1 - g.bottom).toFixed(3)}:w=iw:h=ih*${g.bottom}:${shade}` +
      `,drawbox=x=0:y=ih*${g.top}:w=iw*${g.side}:h=ih*${(1 - g.top - g.bottom).toFixed(3)}:${shade}` +
      `,drawbox=x=iw*${(1 - g.side).toFixed(3)}:y=ih*${g.top}:w=iw*${g.side}:h=ih*${(1 - g.top - g.bottom).toFixed(3)}:${shade}`;
  }
  parts.push(`[vx]ass=${assFileName}${fontsDir}${guides},format=yuv420p[vout]`);

  // --- audio: silence bed + delayed narration + optional ducked music
  let idx = n;
  const silenceInput = idx++;
  const voiceInputs: number[] = [];
  const voiceLabels: string[] = [`[${silenceInput}:a]`];
  input.narration.forEach((file, i) => {
    if (!file) return;
    const k = idx++;
    voiceInputs.push(k);
    const ms = Math.round(timeline.scenes[i].audioStart * 1000);
    parts.push(
      `[${k}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${ms}|${ms}[v${i}]`,
    );
    voiceLabels.push(`[v${i}]`);
  });
  parts.push(
    `${voiceLabels.join('')}amix=inputs=${voiceLabels.length}:normalize=0:duration=first[voice]`,
  );

  let musicInput: number | null = null;
  if (input.music) {
    musicInput = idx++;
    const total = timeline.total;
    const fadeOutStart = Math.max(0, total - 2);
    parts.push(`[voice]asplit=2[voiceout][voicekey]`);
    parts.push(
      `[${musicInput}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${input.plan.musicVolume.toFixed(2)},` +
        `afade=t=in:d=1,afade=t=out:st=${sec(fadeOutStart)}:d=2[mus]`,
    );
    // Duck the music while the voice speaks.
    parts.push(
      `[mus][voicekey]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=500[ducked]`,
    );
    parts.push(`[voiceout][ducked]amix=inputs=2:normalize=0:duration=first[bed]`);
  } else {
    parts.push(`[voice]anull[bed]`);
  }

  let sfxInput: number | null = null;
  if (input.sfxTrack) {
    sfxInput = idx++;
    parts.push(
      `[${sfxInput}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[fx]`,
      `[bed][fx]amix=inputs=2:normalize=0:duration=first[mix]`,
    );
  } else {
    parts.push(`[bed]anull[mix]`);
  }
  parts.push(`[mix]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]`);

  return { graph: parts.join(';\n'), voiceInputs, musicInput, silenceInput, sfxInput };
}

export async function renderVideo(input: RenderInput): Promise<string> {
  const log = input.log ?? (() => undefined);
  const progress = input.onProgress ?? (() => undefined);
  const { plan, timeline, aspect, workDir } = input;
  const quality: Quality = input.quality ?? 'final';
  await fs.mkdir(workDir, { recursive: true });
  const tag = `${aspect.replace(':', 'x')}-${quality}`;

  // 1) One clip per scene, reused from the cache when image + motion + length are unchanged.
  const imageHashes = new Map<string, Promise<string>>();
  const imageHash = (file: string) => {
    if (!imageHashes.has(file)) imageHashes.set(file, hashFile(file));
    return imageHashes.get(file)!;
  };
  const clips: string[] = new Array(timeline.scenes.length);
  const concurrency = Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)));
  let done = 0;
  let reused = 0;
  await pool(timeline.scenes, concurrency, async (ts, i) => {
    throwIfCancelled();
    const scene = plan.scenes[ts.index];
    const image = input.images[scene.imageIndex];
    const frames = Math.max(2, Math.round(ts.clipLength * FPS));
    if (input.cache) {
      const key = hashOf(
        'clip-v1',
        await imageHash(image),
        scene.motion,
        scene.fit,
        frames,
        aspect,
        quality,
      );
      const hit = input.cache.has(key, '.mp4');
      clips[i] = await input.cache.getOrCreate(key, '.mp4', (tmp) =>
        renderSceneClip(image, plan, ts, aspect, tmp, quality),
      );
      if (hit) reused++;
    } else {
      clips[i] = path.join(workDir, `clip-${tag}-${ts.index}.mp4`);
      await renderSceneClip(image, plan, ts, aspect, clips[i], quality);
    }
    done++;
    progress((done / timeline.scenes.length) * 0.8);
  });
  log(`  ${clips.length} scenes ready${reused ? ` (${reused} reused from cache)` : ''}`);

  // 2) Captions.
  const assName = `captions-${tag}.ass`;
  await fs.writeFile(
    path.join(workDir, assName),
    buildAss(plan, timeline, {
      aspect,
      quality,
      fontName: input.fontName || defaultFontName(),
      sceneWords: input.sceneWords,
    }),
    'utf8',
  );

  // 3) Sound effects, timed to the transitions and caption lines of this format.
  const cues = buildCaptionCues(plan, timeline, aspect, input.sceneWords);
  const events = planSfx(plan, timeline, cues);
  const sfxDir = path.join(workDir, `sfx-${tag}`);
  await fs.mkdir(sfxDir, { recursive: true });
  const sfxTrack = await renderSfxTrack(events, timeline.total, sfxDir, input.sfxDir);
  if (events.length) log(`  ${events.length} sound effects placed`);

  // 4) Assemble.
  throwIfCancelled();
  const guides = input.safeZoneGuides && aspect === '9:16' ? SAFE_ZONES[aspect] : null;
  const { graph } = buildFinalGraph({ ...input, sfxTrack, guides }, assName);
  const graphFile = path.join(workDir, `final-${tag}.filtergraph`);
  await fs.writeFile(graphFile, graph, 'utf8');

  const args: string[] = ['-y', '-v', 'error', '-progress', 'pipe:2', '-nostats'];
  for (const clip of clips) args.push('-i', clip);
  args.push('-f', 'lavfi', '-t', sec(timeline.total), '-i', 'anullsrc=r=44100:cl=stereo');
  for (const file of input.narration) if (file) args.push('-i', file);
  if (input.music)
    args.push('-protocol_whitelist', 'file', '-stream_loop', '-1', '-i', input.music);
  if (sfxTrack) args.push('-i', sfxTrack);

  const output = path.resolve(input.output);
  await fs.mkdir(path.dirname(output), { recursive: true });
  const meta = { comment: 'Made with AI (toolface video-studio)', ...input.metadata };
  args.push(
    '-filter_complex_script',
    path.basename(graphFile),
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-t',
    sec(timeline.total),
    '-r',
    String(FPS),
    ...encoderArgs(quality),
    ...Object.entries(meta).flatMap(([k, v]) => ['-metadata', `${k}=${v}`]),
    output,
  );
  log(`  assembling ${aspect} ${quality} (${timeline.total.toFixed(1)}s)…`);
  // cwd = workDir so the captions/filtergraph files are referenced without drive-letter escaping.
  await run(FFMPEG, args, {
    cwd: workDir,
    onStderr: (chunk) => {
      const m = /out_time_us=(\d+)/.exec(chunk);
      if (m) progress(0.8 + 0.2 * Math.min(1, Number(m[1]) / 1e6 / timeline.total));
    },
  });
  progress(1);
  return output;
}
