import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileCache, hashFile, hashOf } from './cache';
import { WordTiming } from './captions';
import { throwIfCancelled, withSignal } from './ffmpeg';
import { Aspect, CaptionStyle, EditPlan, Quality, parseEditPlan } from './plan';
import { ClaudePlanner, HeuristicPlanner, PlanUsage, Planner } from './planner';
import { renderVideo } from './render';
import { buildTimeline } from './timeline';
import { CachedTts, EdgeTts, SilentTts, TtsEngine } from './tts';
import { DEFAULT_LIMITS, InputLimits, validateInputs } from './validate';

/** Shared cache folder: plans, narration and scene clips are reused across runs and jobs. */
export function defaultCacheDir(): string {
  return (
    process.env.VIDEO_STUDIO_CACHE_DIR || path.join(os.homedir(), '.cache', 'toolface-video-studio')
  );
}

export type StudioStage = 'validating' | 'planning' | 'voice' | 'rendering' | 'done';

interface CommonOptions {
  images: string[];
  workDir: string;
  /** Content cache; defaults to defaultCacheDir(). Pass null to disable. */
  cacheDir?: string | null;
  signal?: AbortSignal;
  log?: (msg: string) => void;
  /** Overall progress 0–1 with the current stage. */
  onProgress?: (stage: StudioStage, fraction: number) => void;
}

export interface PlanVideoOptions extends CommonOptions {
  script: string;
  request?: string;
  style?: string;
  /** The format the plan is made for (the first output format). */
  aspect: Aspect;
  voice?: string;
  music?: string;
  planner?: Planner;
  limits?: InputLimits;
  onUsage?: (usage: PlanUsage) => void | Promise<void>;
}

export interface PlanVideoResult {
  plan: EditPlan;
  /** True when the plan came from the cache (no model call, no cost). */
  cached: boolean;
  plannerId: string;
}

export interface RenderPlanOptions extends CommonOptions {
  plan: unknown;
  aspects: Aspect[];
  /** Output file. With several aspects, "-9x16" etc. is added before the extension. */
  output: string;
  quality?: Quality;
  /** Shade the TikTok/Reels UI areas (only drawn on 9:16 previews). */
  safeZoneGuides?: boolean;
  music?: string;
  noVoice?: boolean;
  tts?: TtsEngine;
  fontName?: string;
  fontsDir?: string;
  noSfx?: boolean;
  sfxDir?: string;
  captionStyle?: CaptionStyle;
  voice?: string;
  metadata?: Record<string, string>;
}

export interface RenderPlanResult {
  plan: EditPlan;
  outputs: { aspect: Aspect; file: string; duration: number; quality: Quality }[];
}

export interface CreateVideoOptions
  extends Omit<PlanVideoOptions, 'aspect'>,
    Omit<
      RenderPlanOptions,
      'plan' | 'images' | 'workDir' | 'cacheDir' | 'signal' | 'log' | 'onProgress'
    > {
  /** Use this plan instead of asking the planner (e.g. a plan.json you edited by hand). */
  plan?: unknown;
  /** Stop after writing plan.json. */
  planOnly?: boolean;
}

export interface CreateVideoResult {
  plan: EditPlan;
  planFile: string;
  outputs: RenderPlanResult['outputs'];
}

export function outputPathFor(output: string, aspect: Aspect, multiple: boolean): string {
  if (!multiple) return output;
  const ext = path.extname(output) || '.mp4';
  return `${output.slice(0, output.length - path.extname(output).length)}-${aspect.replace(':', 'x')}${ext}`;
}

function choosePlanner(workDir: string, log: (m: string) => void): Planner {
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

function cacheFor(opts: CommonOptions): FileCache | undefined {
  if (opts.cacheDir === null) return undefined;
  return new FileCache(path.resolve(opts.cacheDir ?? defaultCacheDir()));
}

/**
 * Step 1 — check the inputs and plan the edit. The plan is cached by the content of the inputs,
 * so a retry or a second render never pays for the model call again.
 */
export function planVideo(opts: PlanVideoOptions): Promise<PlanVideoResult> {
  return withSignal(opts.signal, async () => {
    const log = opts.log ?? (() => undefined);
    const progress = opts.onProgress ?? (() => undefined);
    const workDir = path.resolve(opts.workDir);
    await fs.mkdir(workDir, { recursive: true });
    const images = opts.images.map((p) => path.resolve(p));

    progress('validating', 0);
    await validateInputs(
      { images, script: opts.script, music: opts.music ? path.resolve(opts.music) : undefined },
      opts.limits ?? DEFAULT_LIMITS,
    );

    const planner = opts.planner ?? choosePlanner(workDir, log);
    const cache = cacheFor(opts);
    const key = hashOf(
      'plan',
      planner.id,
      await Promise.all(images.map(hashFile)),
      opts.script.trim(),
      opts.request?.trim() ?? '',
      opts.style?.trim() ?? '',
      opts.aspect,
      opts.voice ?? '',
    );
    const cachedPlan = cache ? await cache.readText(key, '.json') : null;
    if (cachedPlan) {
      log('Plan reused from cache.');
      progress('planning', 1);
      return {
        plan: parseEditPlan(JSON.parse(cachedPlan), images.length),
        cached: true,
        plannerId: planner.id,
      };
    }

    throwIfCancelled();
    progress('planning', 0);
    log(`Planning the edit (${planner.id})…`);
    const plan = await planner.plan({
      images,
      script: opts.script,
      request: opts.request,
      style: opts.style,
      aspect: opts.aspect,
      voice: opts.voice,
      onUsage: opts.onUsage,
      signal: opts.signal,
    });
    if (cache) await cache.writeText(key, '.json', JSON.stringify(plan));
    progress('planning', 1);
    return { plan, cached: false, plannerId: planner.id };
  });
}

/** Step 2 — narrate and render a plan into one file per aspect ratio. */
export function renderPlan(opts: RenderPlanOptions): Promise<RenderPlanResult> {
  return withSignal(opts.signal, async () => {
    const log = opts.log ?? (() => undefined);
    const progress = opts.onProgress ?? (() => undefined);
    if (opts.aspects.length === 0) throw new Error('No aspect ratio given');
    const workDir = path.resolve(opts.workDir);
    await fs.mkdir(workDir, { recursive: true });
    const images = opts.images.map((p) => path.resolve(p));
    const quality: Quality = opts.quality ?? 'final';
    const cache = cacheFor(opts);

    const plan = parseEditPlan(opts.plan, images.length);
    if (opts.voice) plan.voice = opts.voice;
    if (opts.noSfx) plan.sfx.enabled = false;
    if (opts.captionStyle) plan.captions.style = opts.captionStyle;

    // Narration per scene (shared by every aspect), cached per sentence + voice.
    const baseTts = opts.tts ?? (await chooseTts(opts.noVoice, log));
    const tts = cache && !(baseTts instanceof SilentTts) ? new CachedTts(baseTts, cache) : baseTts;
    log(`Generating narration (${tts.name})…`);
    const narration: (string | null)[] = [];
    const durations: number[] = [];
    const sceneWords: (WordTiming[] | undefined)[] = [];
    for (let i = 0; i < plan.scenes.length; i++) {
      throwIfCancelled();
      progress('voice', i / plan.scenes.length);
      const text = plan.scenes[i].narration.trim();
      if (!text) {
        narration.push(null);
        durations.push(0);
        sceneWords.push(undefined);
        continue;
      }
      const r = await tts.synthesize(
        text,
        plan.voice,
        plan.speechRate,
        path.join(workDir, `voice-${i}`),
      );
      // Silent placeholders only drive timing; don't mix them.
      narration.push(baseTts instanceof SilentTts ? null : r.file);
      durations.push(r.duration);
      sceneWords.push(r.words);
    }
    progress('voice', 1);
    const timeline = buildTimeline(plan, durations);

    const outputs: RenderPlanResult['outputs'] = [];
    for (let a = 0; a < opts.aspects.length; a++) {
      const aspect = opts.aspects[a];
      log(`Rendering ${aspect} (${quality})…`);
      const file = await renderVideo({
        plan,
        timeline,
        images,
        narration,
        sceneWords,
        sfxDir: opts.sfxDir ? path.resolve(opts.sfxDir) : undefined,
        aspect,
        quality,
        safeZoneGuides: opts.safeZoneGuides,
        cache,
        metadata: { title: plan.title, ...opts.metadata },
        output: outputPathFor(opts.output, aspect, opts.aspects.length > 1),
        workDir,
        music: opts.music ? path.resolve(opts.music) : undefined,
        fontName: opts.fontName,
        fontsDir: opts.fontsDir ? path.resolve(opts.fontsDir) : undefined,
        onProgress: (f) => progress('rendering', (a + f) / opts.aspects.length),
        log,
      });
      outputs.push({ aspect, file, duration: timeline.total, quality });
      log(`✔ ${file}`);
    }
    progress('done', 1);
    return { plan, outputs };
  });
}

/** images + script + request + style → finished video file(s). Used by the CLI. */
export async function createVideo(opts: CreateVideoOptions): Promise<CreateVideoResult> {
  const log = opts.log ?? (() => undefined);
  if (opts.images.length === 0) throw new Error('No images given');
  if (opts.aspects.length === 0) throw new Error('No aspect ratio given');
  const workDir = path.resolve(opts.workDir);
  await fs.mkdir(workDir, { recursive: true });

  let plan: EditPlan;
  if (opts.plan) {
    plan = parseEditPlan(opts.plan, opts.images.length);
    log('Using the given edit plan.');
  } else {
    plan = (await planVideo({ ...opts, aspect: opts.aspects[0] })).plan;
  }
  const planFile = path.join(workDir, 'plan.json');
  await fs.writeFile(planFile, JSON.stringify(plan, null, 2), 'utf8');
  log(`Plan: ${plan.scenes.length} scenes, voice ${plan.voice} → ${planFile}`);
  if (opts.planOnly) return { plan, planFile, outputs: [] };

  const result = await renderPlan({ ...opts, plan });
  return { plan: result.plan, planFile, outputs: result.outputs };
}
