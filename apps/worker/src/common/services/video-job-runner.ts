import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  Aspect,
  CancelledError,
  EditPlan,
  FileCache,
  InputValidationError,
  PlanUsage,
  PlannerError,
  Quality,
  RenderJobData,
  StudioStage,
  VideoJobOptions,
  VideoOutputRef,
  outputKey,
  planVideo,
  renderPlan,
} from '@newsflow/video-studio';

/** The columns of video_jobs the runner reads and writes. */
export interface VideoJobRecord {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  script: string;
  request: string | null;
  style: string | null;
  aspectsJson: unknown;
  voice: string | null;
  optionsJson: unknown;
  imageKeysJson: unknown;
  musicKey: string | null;
  planJson: unknown;
  planRevision: number;
  status: string;
  cancelRequested: boolean;
  deletedAt: Date | null;
}

export interface VideoJobRepository {
  find(id: string): Promise<VideoJobRecord | null>;
  update(id: string, data: Record<string, unknown>): Promise<void>;
  /** Only the cancel flag, polled while a job runs. */
  isCancelRequested(id: string): Promise<boolean>;
}

export interface VideoStorage {
  getToFile(key: string, file: string): Promise<void>;
  putFile(key: string, file: string, contentType?: string): Promise<void>;
}

export interface VideoJobHooks {
  /** Throw or return false to block planning (AI budget). */
  checkAiQuota(workspaceId: string): Promise<{ allowed: boolean; reason?: string }>;
  recordUsage(job: VideoJobRecord, usage: PlanUsage): Promise<void>;
  enqueueRender(data: RenderJobData): Promise<void>;
  log(message: string): void;
}

/** Errors a retry cannot fix: the job fails right away. */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

export interface RunnerDeps {
  repo: VideoJobRepository;
  storage: VideoStorage;
  hooks: VideoJobHooks;
  /** Scratch space; one sub-folder per job, removed afterwards. */
  workRoot: string;
  /** Content cache shared by all jobs on this machine. */
  cacheDir: string;
  /** Keep the cache below this size. */
  cacheMaxBytes?: number;
  /** For tests: replace the studio functions. */
  studio?: { planVideo: typeof planVideo; renderPlan: typeof renderPlan };
  cancelPollMs?: number;
}

const CONTENT_TYPES: Record<string, string> = { '.mp4': 'video/mp4' };

/** Readable message for the UI; never leaks stack traces or keys. */
export function publicErrorMessage(err: unknown): string {
  if (
    err instanceof InputValidationError ||
    err instanceof PlannerError ||
    err instanceof PermanentJobError
  ) {
    return err.message;
  }
  if (err instanceof CancelledError) return 'Đã huỷ';
  const msg = err instanceof Error ? err.message : String(err);
  if (/edge-tts failed/i.test(msg))
    return 'Không tạo được giọng đọc (Edge TTS cần kết nối Internet). Thử lại sau.';
  if (/took longer than/i.test(msg))
    return 'Render quá lâu và đã bị dừng. Thử bớt ảnh hoặc rút ngắn kịch bản.';
  if (/overloaded|rate.?limit|429|529|timeout/i.test(msg))
    return 'Dịch vụ AI đang quá tải. Hệ thống sẽ tự thử lại.';
  return 'Có lỗi khi xử lý video. Hệ thống đã ghi lại lỗi để kiểm tra.';
}

export function isPermanent(err: unknown): boolean {
  return (
    err instanceof InputValidationError ||
    err instanceof PlannerError ||
    err instanceof PermanentJobError ||
    err instanceof CancelledError
  );
}

/**
 * Runs the two steps of a video job — plan and render — against the database, object storage
 * and the video-studio library. Framework-free so it can be tested without Nest or Redis.
 */
export class VideoJobRunner {
  private readonly studio: { planVideo: typeof planVideo; renderPlan: typeof renderPlan };

  constructor(private readonly deps: RunnerDeps) {
    this.studio = deps.studio ?? { planVideo, renderPlan };
  }

  async runPlan(videoJobId: string): Promise<void> {
    const job = await this.load(videoJobId);
    if (!job) return;
    await this.withJob(job, 'PLANNING', null, async (ctx) => {
      const quota = await this.deps.hooks.checkAiQuota(job.workspaceId);
      if (!quota.allowed) {
        throw new PermanentJobError(
          `Đã hết hạn mức AI của workspace: ${quota.reason ?? 'vượt ngân sách'}`,
        );
      }
      const inputs = await this.downloadInputs(job, ctx.dir);
      const aspects = this.aspects(job);
      const result = await this.studio.planVideo({
        images: inputs.images,
        music: inputs.music,
        script: job.script,
        request: job.request ?? undefined,
        style: job.style ?? undefined,
        voice: job.voice ?? undefined,
        aspect: aspects[0],
        workDir: path.join(ctx.dir, 'plan'),
        cacheDir: this.deps.cacheDir,
        signal: ctx.signal,
        onProgress: (stage, f) => ctx.progress(stage, f * 100),
        onUsage: (u) => this.deps.hooks.recordUsage(job, u),
        log: (m) => this.deps.hooks.log(`[video ${job.id}] ${m}`),
      });
      const revision = job.planRevision + 1;
      await this.deps.repo.update(job.id, {
        planJson: result.plan as unknown as object,
        plannerId: result.plannerId,
        title: result.plan.title,
        planRevision: revision,
        status: 'RENDERING',
        renderKind: 'preview',
        stage: 'queued',
        progress: 0,
        errorMessage: null,
      });
      // A preview follows every new plan so the user sees the cut straight away.
      await this.deps.hooks.enqueueRender({
        videoJobId: job.id,
        workspaceId: job.workspaceId,
        kind: 'preview',
        revision,
      });
    });
  }

  async runRender(data: RenderJobData): Promise<void> {
    const job = await this.load(data.videoJobId);
    if (!job) return;
    if (!job.planJson) throw new PermanentJobError('Video chưa có kế hoạch dựng');
    if (data.kind === 'preview' && data.revision !== job.planRevision) {
      // The plan was edited again after this preview was queued; a newer render is on its way.
      this.deps.hooks.log(`[video ${job.id}] skip stale preview r${data.revision}`);
      return;
    }
    const revision = job.planRevision;
    await this.withJob(job, 'RENDERING', data.kind, async (ctx) => {
      const inputs = await this.downloadInputs(job, ctx.dir);
      const options = (job.optionsJson ?? {}) as VideoJobOptions;
      // Previews show the first format only; the final render makes every format.
      const aspects = data.kind === 'preview' ? this.aspects(job).slice(0, 1) : this.aspects(job);
      const result = await this.studio.renderPlan({
        plan: job.planJson,
        images: inputs.images,
        music: inputs.music,
        aspects,
        quality: data.kind,
        safeZoneGuides: data.kind === 'preview',
        noVoice: options.noVoice,
        noSfx: options.noSfx,
        captionStyle: options.captionStyle,
        output: path.join(ctx.dir, 'out', 'video.mp4'),
        workDir: path.join(ctx.dir, 'render'),
        cacheDir: this.deps.cacheDir,
        metadata: { comment: 'Made with AI (toolface video-studio)' },
        signal: ctx.signal,
        onProgress: (stage, f) => ctx.progress(stage, stage === 'rendering' ? 10 + f * 85 : f * 10),
        log: (m) => this.deps.hooks.log(`[video ${job.id}] ${m}`),
      });

      await ctx.progress('uploading', 96);
      const refs: VideoOutputRef[] = [];
      for (const o of result.outputs) {
        const key = outputKey(job.workspaceId, job.id, data.kind, revision, o.aspect);
        await this.deps.storage.putFile(key, o.file, CONTENT_TYPES['.mp4']);
        refs.push({ aspect: o.aspect, key, duration: Math.round(o.duration * 10) / 10 });
      }
      await this.deps.repo.update(job.id, {
        ...(data.kind === 'preview'
          ? { previewJson: refs as unknown as object, previewRevision: revision }
          : { outputsJson: refs as unknown as object, outputsRevision: revision }),
        status: 'READY',
        stage: null,
        progress: 100,
        errorMessage: null,
        completedAt: new Date(),
      });
    });
  }

  /** Mark a job failed after its last attempt (or a permanent error). */
  async markFailed(videoJobId: string, err: unknown): Promise<void> {
    await this.deps.repo.update(videoJobId, {
      status: err instanceof CancelledError ? 'CANCELLED' : 'FAILED',
      stage: null,
      errorMessage: publicErrorMessage(err),
    });
  }

  private async load(id: string): Promise<VideoJobRecord | null> {
    const job = await this.deps.repo.find(id);
    if (!job || job.deletedAt) return null;
    if (job.cancelRequested) {
      await this.deps.repo.update(id, { status: 'CANCELLED', stage: null });
      return null;
    }
    return job;
  }

  private aspects(job: VideoJobRecord): Aspect[] {
    const list = Array.isArray(job.aspectsJson) ? (job.aspectsJson as Aspect[]) : [];
    return list.length ? list : ['9:16'];
  }

  private async downloadInputs(
    job: VideoJobRecord,
    dir: string,
  ): Promise<{ images: string[]; music?: string }> {
    const keys = Array.isArray(job.imageKeysJson) ? (job.imageKeysJson as string[]) : [];
    if (keys.length === 0) throw new PermanentJobError('Video không có ảnh nào');
    const images: string[] = [];
    for (const key of keys) {
      const file = path.join(dir, 'input', path.basename(key));
      await this.deps.storage.getToFile(key, file);
      images.push(file);
    }
    let music: string | undefined;
    if (job.musicKey) {
      music = path.join(dir, 'input', path.basename(job.musicKey));
      await this.deps.storage.getToFile(job.musicKey, music);
    }
    return { images, music };
  }

  /**
   * Common frame for both steps: status + attempts bookkeeping, throttled progress writes,
   * a cancel watcher that aborts every running command, and scratch-space cleanup.
   */
  private async withJob(
    job: VideoJobRecord,
    status: 'PLANNING' | 'RENDERING',
    renderKind: Quality | null,
    work: (ctx: {
      dir: string;
      signal: AbortSignal;
      progress: (stage: StudioStage | 'uploading', percent: number) => Promise<void>;
    }) => Promise<void>,
  ): Promise<void> {
    const dir = path.join(this.deps.workRoot, `${job.id}-${Date.now()}`);
    await fs.mkdir(dir, { recursive: true });
    const abort = new AbortController();
    const poll = setInterval(async () => {
      try {
        if (await this.deps.repo.isCancelRequested(job.id)) abort.abort();
      } catch {
        // keep running; the next poll may succeed
      }
    }, this.deps.cancelPollMs ?? 2000);

    let lastWrite = 0;
    let lastPercent = -1;
    const progress = async (stage: string, percent: number) => {
      const p = Math.max(0, Math.min(99, Math.round(percent)));
      const now = Date.now();
      if (p === lastPercent || (now - lastWrite < 1000 && p - lastPercent < 5)) return;
      lastWrite = now;
      lastPercent = p;
      await this.deps.repo.update(job.id, { stage, progress: p }).catch(() => undefined);
    };

    await this.deps.repo.update(job.id, {
      status,
      renderKind,
      stage: 'starting',
      progress: 0,
      errorMessage: null,
      attempts: { increment: 1 },
    });
    try {
      await work({ dir, signal: abort.signal, progress });
    } finally {
      clearInterval(poll);
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
      if (this.deps.cacheMaxBytes) {
        await new FileCache(this.deps.cacheDir).prune(this.deps.cacheMaxBytes).catch(() => 0);
      }
    }
  }
}

export type { EditPlan };
