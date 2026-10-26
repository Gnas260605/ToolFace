import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Aspect, EditPlan, parseEditPlan } from './plan';
import { ClaudePlanner, HeuristicPlanner, Planner } from './planner';
import { renderVideo } from './render';
import { buildTimeline } from './timeline';
import { EdgeTts, SilentTts, TtsEngine } from './tts';

export interface CreateVideoOptions {
  images: string[];
  script: string;
  request?: string;
  style?: string;
  /** One or more output formats. The plan is made once (for the first) and reused. */
  aspects: Aspect[];
  /** Output file. With several aspects, "-9x16" etc. is added before the extension. */
  output: string;
  workDir: string;
  voice?: string;
  music?: string;
  /** Skip narration audio (captions only). */
  noVoice?: boolean;
  /** Use this plan instead of asking the planner (e.g. a plan.json you edited by hand). */
  plan?: unknown;
  /** Stop after writing plan.json. */
  planOnly?: boolean;
  planner?: Planner;
  tts?: TtsEngine;
  fontName?: string;
  fontsDir?: string;
  log?: (msg: string) => void;
}

export interface CreateVideoResult {
  plan: EditPlan;
  planFile: string;
  outputs: { aspect: Aspect; file: string; duration: number }[];
}

export function outputPathFor(output: string, aspect: Aspect, multiple: boolean): string {
  if (!multiple) return output;
  const ext = path.extname(output) || '.mp4';
  return `${output.slice(0, output.length - path.extname(output).length)}-${aspect.replace(':', 'x')}${ext}`;
}

async function choosePlanner(workDir: string, log: (m: string) => void): Promise<Planner> {
  if (process.env.ANTHROPIC_API_KEY) return new ClaudePlanner(workDir);
  log('⚠ ANTHROPIC_API_KEY not set — using the offline planner (no image understanding).');
  return new HeuristicPlanner();
}

async function chooseTts(
  noVoice: boolean | undefined,
  log: (m: string) => void,
): Promise<TtsEngine> {
  if (noVoice) return new SilentTts();
  if (await EdgeTts.isAvailable()) return new EdgeTts();
  log('⚠ edge-tts not found (pip install edge-tts) — rendering without voice.');
  return new SilentTts();
}

/** images + script + request + style → finished video file(s). */
export async function createVideo(opts: CreateVideoOptions): Promise<CreateVideoResult> {
  const log = opts.log ?? (() => undefined);
  if (opts.images.length === 0) throw new Error('No images given');
  if (opts.aspects.length === 0) throw new Error('No aspect ratio given');
  const workDir = path.resolve(opts.workDir);
  await fs.mkdir(workDir, { recursive: true });
  const images = opts.images.map((p) => path.resolve(p));
  for (const img of images) await fs.access(img);

  // 1) Plan the edit.
  let plan: EditPlan;
  if (opts.plan) {
    plan = parseEditPlan(opts.plan, images.length);
    log('Using the given edit plan.');
  } else {
    const planner = opts.planner ?? (await choosePlanner(workDir, log));
    log(`Planning the edit (${planner.constructor.name})…`);
    plan = await planner.plan({
      images,
      script: opts.script,
      request: opts.request,
      style: opts.style,
      aspect: opts.aspects[0],
      voice: opts.voice,
    });
  }
  if (opts.voice) plan.voice = opts.voice;
  const planFile = path.join(workDir, 'plan.json');
  await fs.writeFile(planFile, JSON.stringify(plan, null, 2), 'utf8');
  log(`Plan: ${plan.scenes.length} scenes, voice ${plan.voice} → ${planFile}`);
  if (opts.planOnly) return { plan, planFile, outputs: [] };

  // 2) Narration per scene (shared by every aspect).
  const tts = opts.tts ?? (await chooseTts(opts.noVoice, log));
  log(`Generating narration (${tts.name})…`);
  const narration: (string | null)[] = [];
  const durations: number[] = [];
  for (let i = 0; i < plan.scenes.length; i++) {
    const text = plan.scenes[i].narration.trim();
    if (!text) {
      narration.push(null);
      durations.push(0);
      continue;
    }
    const r = await tts.synthesize(
      text,
      plan.voice,
      plan.speechRate,
      path.join(workDir, `voice-${i}`),
    );
    // Silent placeholders only drive timing; don't mix them.
    narration.push(tts instanceof SilentTts ? null : r.file);
    durations.push(r.duration);
  }
  const timeline = buildTimeline(plan, durations);

  // 3) Render every requested format.
  const outputs: CreateVideoResult['outputs'] = [];
  for (const aspect of opts.aspects) {
    log(`Rendering ${aspect}…`);
    const file = await renderVideo({
      plan,
      timeline,
      images,
      narration,
      aspect,
      output: outputPathFor(opts.output, aspect, opts.aspects.length > 1),
      workDir,
      music: opts.music ? path.resolve(opts.music) : undefined,
      fontName: opts.fontName,
      fontsDir: opts.fontsDir ? path.resolve(opts.fontsDir) : undefined,
      log,
    });
    outputs.push({ aspect, file, duration: timeline.total });
    log(`✔ ${file}`);
  }
  return { plan, planFile, outputs };
}
