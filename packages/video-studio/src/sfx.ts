import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { CaptionCue } from './captions';
import { FFMPEG, run, sec } from './ffmpeg';
import { EditPlan } from './plan';
import { Timeline } from './timeline';

/** Sound names. pop0..pop2 are slightly different pitches so repeated pops don't sound robotic. */
export const SFX_SOUNDS = ['whoosh', 'tick', 'hit', 'pop0', 'pop1', 'pop2'] as const;
export type SfxSound = (typeof SFX_SOUNDS)[number];

export interface SfxEvent {
  sound: SfxSound;
  /** Absolute start time in seconds. */
  time: number;
  gain: number;
}

/** Where the loud part of each generated sound sits, so it lands on the visual moment. */
const PEAK: Record<SfxSound, number> = {
  whoosh: 0.35,
  tick: 0,
  hit: 0,
  pop0: 0,
  pop1: 0,
  pop2: 0,
};

const GAIN: Record<SfxSound, number> = {
  whoosh: 1.0,
  tick: 0.45,
  hit: 0.7,
  pop0: 0.3,
  pop1: 0.3,
  pop2: 0.3,
};

/**
 * Decide which sound plays when:
 * - start of the video: a hit under the hook headline (or a whoosh if there is no hook)
 * - every image change: whoosh (or a tick for hard cuts)
 * - every caption line appearing: a soft pop (optional)
 */
export function planSfx(plan: EditPlan, timeline: Timeline, cues: CaptionCue[]): SfxEvent[] {
  if (!plan.sfx.enabled || plan.sfx.volume <= 0) return [];
  const v = plan.sfx.volume;
  const events: SfxEvent[] = [];
  const add = (sound: SfxSound, moment: number) =>
    events.push({ sound, time: Math.max(0, moment - PEAK[sound]), gain: GAIN[sound] * v });

  add(plan.hookText?.trim() ? 'hit' : 'whoosh', plan.hookText?.trim() ? 0.05 : 0.35);

  for (let i = 1; i < timeline.scenes.length; i++) {
    const prev = timeline.scenes[i - 1];
    const at = timeline.scenes[i].start + prev.transitionDuration / 2;
    add(prev.transition === 'cut' ? 'tick' : 'whoosh', at);
  }

  if (plan.sfx.captionPop) {
    const busy = events.map((e) => e.time + PEAK[e.sound]);
    let n = 0;
    for (const cue of cues) {
      // Don't stack a pop on top of a whoosh/hit.
      if (busy.some((t) => Math.abs(t - cue.start) < 0.3)) continue;
      add(`pop${n++ % 3}` as SfxSound, cue.start);
    }
  }
  return events.sort((a, b) => a.time - b.time);
}

/** FFmpeg lavfi sources for each sound — synthesised, so there are no copyright issues. */
const RECIPES: Record<SfxSound, string> = {
  // Band-limited pink noise swelling in and out.
  whoosh:
    'anoisesrc=d=0.7:c=pink:r=44100:a=0.9,highpass=f=350,lowpass=f=5000,' +
    'afade=t=in:st=0:d=0.35:curve=exp,afade=t=out:st=0.35:d=0.35:curve=exp',
  // Short bright click.
  tick: "aevalsrc='0.8*sin(2*PI*2400*t)*exp(-t*90)':s=44100:d=0.06",
  // Low boom + noise burst.
  hit:
    "aevalsrc='0.9*sin(2*PI*t*(110-60*t))*exp(-t*5)+0.35*(random(0)*2-1)*exp(-t*28)':s=44100:d=0.9," +
    'lowpass=f=3500',
  // Bubbly pop: falling chirp with a fast decay.
  pop0: "aevalsrc='0.9*sin(2*PI*t*(700-2400*t))*exp(-t*38)':s=44100:d=0.13",
  pop1: "aevalsrc='0.9*sin(2*PI*t*(850-2900*t))*exp(-t*38)':s=44100:d=0.13",
  pop2: "aevalsrc='0.9*sin(2*PI*t*(1000-3400*t))*exp(-t*38)':s=44100:d=0.13",
};

const AUDIO_EXT = ['.wav', '.mp3', '.ogg', '.m4a', '.flac'];

/** Find a user-supplied sound: <dir>/whoosh.mp3, <dir>/pop.wav (used for all pops)… */
function customSound(dir: string | undefined, sound: SfxSound): string | undefined {
  if (!dir) return undefined;
  const names = sound.startsWith('pop') ? [sound, 'pop'] : [sound];
  for (const name of names) {
    for (const ext of AUDIO_EXT) {
      const p = path.join(dir, name + ext);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

/** Generate (once) or locate every sound file needed. */
export async function prepareSfxFiles(
  sounds: SfxSound[],
  cacheDir: string,
  customDir?: string,
): Promise<Record<string, string>> {
  await fs.mkdir(cacheDir, { recursive: true });
  const files: Record<string, string> = {};
  for (const sound of new Set(sounds)) {
    const custom = customSound(customDir, sound);
    if (custom) {
      files[sound] = custom;
      continue;
    }
    const out = path.join(cacheDir, `sfx-${sound}.wav`);
    if (!existsSync(out)) {
      await run(FFMPEG, [
        '-y',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        RECIPES[sound],
        '-ac',
        '2',
        out,
      ]);
    }
    files[sound] = out;
  }
  return files;
}

/** Build the filter graph that places every event on one track. Exported for tests. */
export function buildSfxGraph(
  events: SfxEvent[],
  inputOrder: SfxSound[],
): { graph: string; inputs: number } {
  const parts: string[] = [];
  const labels: string[] = ['[0:a]']; // input 0 = silence bed of the full length
  inputOrder.forEach((sound, k) => {
    const mine = events.filter((e) => e.sound === sound);
    if (mine.length === 0) return;
    const inIdx = k + 1;
    const split = mine.map((_, j) => `[s${k}_${j}]`);
    parts.push(
      `[${inIdx}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo` +
        (mine.length > 1 ? `,asplit=${mine.length}${split.join('')}` : `${split[0]}`),
    );
    mine.forEach((e, j) => {
      const ms = Math.round(e.time * 1000);
      parts.push(`[s${k}_${j}]volume=${e.gain.toFixed(3)},adelay=${ms}|${ms}[e${k}_${j}]`);
      labels.push(`[e${k}_${j}]`);
    });
  });
  parts.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=first[sfx]`);
  return { graph: parts.join(';\n'), inputs: inputOrder.length + 1 };
}

/** Render all sound effects into one WAV track as long as the video. Returns null if there are none. */
export async function renderSfxTrack(
  events: SfxEvent[],
  total: number,
  workDir: string,
  customDir?: string,
): Promise<string | null> {
  if (events.length === 0) return null;
  const used = [...new Set(events.map((e) => e.sound))];
  const files = await prepareSfxFiles(used, workDir, customDir);
  const { graph } = buildSfxGraph(events, used);
  const graphFile = path.join(workDir, 'sfx.filtergraph');
  await fs.writeFile(graphFile, graph, 'utf8');
  const out = path.join(workDir, 'sfx-track.wav');
  const args = [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-t',
    sec(total),
    '-i',
    'anullsrc=r=44100:cl=stereo',
  ];
  for (const s of used) args.push('-i', files[s]);
  args.push(
    '-filter_complex_script',
    path.basename(graphFile),
    '-map',
    '[sfx]',
    '-t',
    sec(total),
    out,
  );
  await run(FFMPEG, args, { cwd: workDir });
  return out;
}
