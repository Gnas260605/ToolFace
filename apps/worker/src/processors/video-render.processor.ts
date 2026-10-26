/* eslint-disable @typescript-eslint/no-explicit-any */
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import os from 'node:os';
import path from 'node:path';
import { getServerEnv } from '@newsflow/config';
import { ObjectStorage, PromptTaskType, QuotaManager, calculateHash } from '@newsflow/database';
import {
  PlanJobData,
  RenderJobData,
  VIDEO_JOB_ATTEMPTS,
  VIDEO_JOB_BACKOFF,
  VIDEO_RENDER_QUEUE,
  defaultCacheDir,
  renderJobId,
} from '@newsflow/video-studio';
import { DatabaseService } from '../common/database.service';
import { JsonLogger } from '../common/logger.service';
import { VideoJobRunner, isPermanent } from '../common/services/video-job-runner';

const env = getServerEnv();

/**
 * Plans and renders Video Studio jobs. Rendering is CPU-bound, so concurrency stays low
 * (VIDEO_RENDER_CONCURRENCY); scale out with more worker containers instead.
 * FFmpeg runs in child processes, so the event loop stays free to renew the job lock.
 */
@Processor(VIDEO_RENDER_QUEUE, {
  concurrency: env.VIDEO_RENDER_CONCURRENCY,
  lockDuration: 120_000,
  maxStalledCount: 2,
})
@Injectable()
export class VideoRenderProcessor extends WorkerHost implements OnModuleInit {
  private runner!: VideoJobRunner;
  private readonly quota: QuotaManager;
  private readonly storage = new ObjectStorage();

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(JsonLogger) private readonly logger: JsonLogger,
    @InjectQueue(VIDEO_RENDER_QUEUE) private readonly queue: Queue,
  ) {
    super();
    this.quota = new QuotaManager(this.db as any);
  }

  onModuleInit() {
    const p = this.db as any;
    this.runner = new VideoJobRunner({
      repo: {
        find: (id) => p.videoJob.findUnique({ where: { id } }),
        update: async (id, data) => {
          await p.videoJob.update({ where: { id }, data });
        },
        isCancelRequested: async (id) =>
          !!(await p.videoJob.findUnique({ where: { id }, select: { cancelRequested: true } }))
            ?.cancelRequested,
      },
      storage: this.storage,
      hooks: {
        checkAiQuota: (workspaceId) => this.quota.checkQuota(workspaceId),
        recordUsage: async (job, u) => {
          const costUsd =
            (u.inputTokens * env.VIDEO_PLANNER_USD_PER_MTOK_IN +
              u.outputTokens * env.VIDEO_PLANNER_USD_PER_MTOK_OUT) /
            1_000_000;
          await p.aiUsageEvent.create({
            data: {
              workspaceId: job.workspaceId,
              userId: job.createdByUserId,
              taskType: PromptTaskType.VIDEO_PLANNING,
              provider: u.provider,
              model: u.model,
              inputTokens: u.inputTokens,
              outputTokens: u.outputTokens,
              estimatedCostMinor: Math.ceil(costUsd * 100),
              currency: 'USD',
              requestHash: calculateHash(`video-plan:${job.id}:${Date.now()}`),
              status: 'SUCCESS',
              durationMs: u.durationMs,
              metadataJson: {
                videoJobId: job.id,
                cacheReadTokens: u.cacheReadTokens,
                cacheWriteTokens: u.cacheWriteTokens,
              },
            },
          });
        },
        enqueueRender: async (data) => {
          await this.queue.add('render', data, {
            jobId: renderJobId(data.videoJobId, data.kind, data.revision),
            attempts: VIDEO_JOB_ATTEMPTS,
            backoff: VIDEO_JOB_BACKOFF,
            removeOnComplete: { count: 200 },
            removeOnFail: { count: 1000 },
          });
        },
        log: (m) => this.logger.log(m, 'VideoRenderProcessor'),
      },
      workRoot: path.join(os.tmpdir(), 'video-studio-jobs'),
      cacheDir: env.VIDEO_STUDIO_CACHE_DIR || defaultCacheDir(),
      cacheMaxBytes: 10 * 1024 ** 3,
    });
  }

  async process(job: Job<PlanJobData | RenderJobData>): Promise<void> {
    const { videoJobId } = job.data;
    try {
      if (job.name === 'plan') await this.runner.runPlan(videoJobId);
      else if (job.name === 'render') await this.runner.runRender(job.data as RenderJobData);
      else throw new UnrecoverableError(`Unknown video job ${job.name}`);
    } catch (err) {
      const e = err as Error;
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      this.logger.error(
        `Video job ${videoJobId} (${job.name}) failed on attempt ${job.attemptsMade + 1}: ${e.message}`,
        e.stack,
        'VideoRenderProcessor',
      );
      if (isPermanent(err) || lastAttempt) {
        await this.runner.markFailed(videoJobId, err);
        throw new UnrecoverableError(e.message);
      }
      await (this.db as any).videoJob
        .update({ where: { id: videoJobId }, data: { stage: 'retrying' } })
        .catch(() => undefined);
      throw err;
    }
  }

  @OnWorkerEvent('error')
  onError(err: Error) {
    this.logger.error(
      `video-render worker error: ${err.message}`,
      err.stack,
      'VideoRenderProcessor',
    );
  }
}
