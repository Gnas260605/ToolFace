/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ScheduledPublicationWorker — Phase 5
 *
 * Processes items from the `scheduled-publication` queue.
 * Database is the source of truth; queue delivery is best-effort.
 * Idempotent: validates schedule version before executing.
 */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { DatabaseService } from '../common/database.service';
import { JsonLogger } from '../common/logger.service';
import Redis from 'ioredis';

const LATE_GRACE_MINUTES = parseInt(process.env.SCHEDULER_LATE_GRACE_MINUTES ?? '30', 10);
const EXECUTION_DEADLINE_MINUTES = parseInt(process.env.SCHEDULER_EXECUTION_DEADLINE_MINUTES ?? '30', 10);
const LOCK_TTL_MS = parseInt(process.env.SCHEDULER_LOCK_TTL_SECONDS ?? '60', 10) * 1000;

export interface ScheduledPublicationJobPayload {
  publishJobId: string;
  workspaceId: string;
  scheduleVersion: number;
  correlationId: string;
  createdAt: string;
}

@Processor('scheduled-publication', { concurrency: 3 })
export class ScheduledPublicationWorker extends WorkerHost {
  private readonly redis: Redis;

  constructor(
    private readonly db: DatabaseService,
    private readonly logger: JsonLogger,
    @InjectQueue('facebook-publish') private readonly facebookQueue: Queue,
  ) {
    super();
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.redis = new Redis(redisUrl, { lazyConnect: true, enableReadyCheck: false });
  }

  private get p(): any { return this.db; }

  async process(job: Job<ScheduledPublicationJobPayload>): Promise<void> {
    const { publishJobId, workspaceId, scheduleVersion, correlationId } = job.data;

    this.logger.log({
      message: 'Processing scheduled-publication',
      publishJobId,
      workspaceId,
      scheduleVersion,
      correlationId,
      attempt: job.attemptsMade + 1,
    });

    // 1. Acquire distributed lock per publish job (SET NX PX)
    const lockKey = `lock:scheduled-pub:${publishJobId}`;
    const lockToken = `${process.pid}-${Date.now()}`;
    const acquired = await this.redis.set(lockKey, lockToken, 'PX', LOCK_TTL_MS, 'NX');

    if (!acquired) {
      this.logger.log({ message: 'Could not acquire lock, another instance is processing', publishJobId });
      return;
    }

    // Lua script for atomic conditional release (only release if we own it)
    const releaseLua = `
      if redis.call("get",KEYS[1]) == ARGV[1] then
        return redis.call("del",KEYS[1])
      else
        return 0
      end`;

    try {
      // 2. Reload publish job from DB (source of truth)
      const publishJob = await this.p.publishJob.findUnique({
        where: { id: publishJobId },
        include: { pageConnection: true },
      });

      if (!publishJob) {
        this.logger.error({ message: 'Publish job not found in DB', publishJobId });
        return;
      }

      // 3. Validate workspace
      if (publishJob.workspaceId !== workspaceId) {
        this.logger.error({ message: 'Workspace mismatch', publishJobId, expected: workspaceId });
        return;
      }

      // 4. Validate schedule version (reject superseded queue items)
      if (publishJob.scheduleVersion !== scheduleVersion) {
        this.logger.log({
          message: 'Schedule version superseded, exiting',
          publishJobId,
          dbVersion: publishJob.scheduleVersion,
          queueVersion: scheduleVersion,
        });
        return;
      }

      // 5. Exit if in terminal state
      const terminalStates = ['PUBLISHED', 'FAILED', 'CANCELLED', 'EXPIRED'];
      if (terminalStates.includes(publishJob.status)) {
        this.logger.log({ message: `Job already in terminal state ${publishJob.status}`, publishJobId });
        return;
      }

      // 6. Check if publish time has arrived
      const now = new Date();
      if (!publishJob.publishAtUtc) {
        this.logger.error({ message: 'publishAtUtc is null on scheduled job', publishJobId });
        return;
      }

      const publishAt = new Date(publishJob.publishAtUtc);
      const earlyByMs = publishAt.getTime() - now.getTime();

      if (earlyByMs > 5000) {
        // Re-enqueue with appropriate delay
        this.logger.log({ message: 'Job arrived early, re-enqueuing', publishJobId, earlyByMs });
        await this.facebookQueue.add(
          'scheduled-publication',
          job.data,
          { delay: earlyByMs, jobId: `scheduled-pub-${publishJobId}-v${scheduleVersion}-retry` },
        );
        return;
      }

      // 7. Check execution deadline (late-job policy)
      const lateByMs = now.getTime() - publishAt.getTime();
      const lateByMinutes = lateByMs / 60000;

      if (lateByMinutes > LATE_GRACE_MINUTES + EXECUTION_DEADLINE_MINUTES) {
        await this.markExpired(publishJobId, workspaceId, correlationId, `Job is ${Math.round(lateByMinutes)} minutes late, exceeds grace window`);
        return;
      }

      // 8. Revalidate approval
      const draft = await this.p.draft.findUnique({ where: { id: publishJob.draftId } });
      if (
        !draft ||
        draft.workspaceId !== workspaceId ||
        draft.status !== 'APPROVED' ||
        draft.approvalRevokedAt ||
        draft.currentVersionId !== publishJob.draftVersionId
      ) {
        await this.failJob(publishJobId, workspaceId, 'PUBLISH_APPROVAL_REVOKED', 'Draft approval was revoked before scheduled execution', correlationId);
        return;
      }

      // 9. Revalidate page connection
      const pageConn = publishJob.pageConnection;
      if (!pageConn || pageConn.workspaceId !== workspaceId || pageConn.status !== 'ACTIVE') {
        await this.failJob(publishJobId, workspaceId, 'SCHEDULE_PAGE_REAUTH_REQUIRED', 'Page connection is not active', correlationId);
        // Emit outbox event for reauth notification
        await this.p.outboxEvent.create({
          data: {
            workspaceId,
            eventType: 'facebook.reauthorization_required',
            aggregateType: 'FacebookPageConnection',
            aggregateId: pageConn?.id ?? 'unknown',
            payloadJson: { publishJobId, correlationId },
            correlationId,
          },
        });
        return;
      }

      // 10. Mark DUE → hand off to existing facebook-publish pipeline
      await this.p.publishJob.update({
        where: { id: publishJobId },
        data: { status: 'DUE' },
      });

      await this.facebookQueue.add(
        'facebook-publish',
        { publishJobId, workspaceId, correlationId, createdAt: new Date().toISOString() },
        {
          jobId: `fb-pub-${publishJobId}`,
          attempts: parseInt(process.env.META_MAX_PUBLISH_ATTEMPTS ?? '5', 10),
          backoff: { type: 'exponential', delay: parseInt(process.env.META_RETRY_BASE_DELAY_MS ?? '2000', 10) },
        },
      );

      this.logger.log({ message: 'Handed off to facebook-publish queue', publishJobId, correlationId });
    } finally {
      // Release lock atomically (only if we still own it)
      try {
        await this.redis.eval(releaseLua, 1, lockKey, lockToken);
      } catch { /* ignore release error */ }
    }
  }

  private async markExpired(publishJobId: string, workspaceId: string, correlationId: string, reason: string): Promise<void> {
    await this.p.$transaction(async (tx: any) => {
      await tx.publishJob.update({
        where: { id: publishJobId },
        data: { status: 'EXPIRED', failedAt: new Date() },
      });
      await tx.outboxEvent.create({
        data: {
          workspaceId,
          eventType: 'publish.failed',
          aggregateType: 'PublishJob',
          aggregateId: publishJobId,
          payloadJson: { publishJobId, reason, errorCode: 'SCHEDULE_EXPIRED', correlationId },
          correlationId,
        },
      });
    });
    this.logger.log({ message: 'Job marked EXPIRED', publishJobId, reason });
  }

  private async failJob(publishJobId: string, workspaceId: string, errorCode: string, reason: string, correlationId: string): Promise<void> {
    await this.p.$transaction(async (tx: any) => {
      await tx.publishJob.update({
        where: { id: publishJobId },
        data: { status: 'FAILED', failedAt: new Date(), lastErrorCode: errorCode, lastErrorMessage: reason },
      });
      await tx.outboxEvent.create({
        data: {
          workspaceId,
          eventType: 'publish.failed',
          aggregateType: 'PublishJob',
          aggregateId: publishJobId,
          payloadJson: { publishJobId, errorCode, reason, correlationId },
          correlationId,
        },
      });
    });
    this.logger.error({ message: 'Scheduled job failed', publishJobId, errorCode, reason });
  }
}
