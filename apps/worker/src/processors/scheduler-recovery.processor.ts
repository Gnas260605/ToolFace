/* eslint-disable @typescript-eslint/no-explicit-any */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { DatabaseService } from '../common/database.service';
import { JsonLogger } from '../common/logger.service';
import Redis from 'ioredis';

const RECOVERY_BATCH_SIZE = parseInt(process.env.SCHEDULER_BATCH_SIZE ?? '100', 10);
const LOCK_TTL_MS = parseInt(process.env.SCHEDULER_LOCK_TTL_SECONDS ?? '60', 10) * 1000;

@Processor('maintenance', { concurrency: 1 })
export class SchedulerRecoveryProcessor extends WorkerHost {
  private readonly redis: Redis;

  constructor(
    private readonly db: DatabaseService,
    private readonly logger: JsonLogger,
    @InjectQueue('scheduled-publication') private readonly scheduledQueue: Queue,
  ) {
    super();
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.redis = new Redis(redisUrl, { lazyConnect: true, enableReadyCheck: false });
  }

  private get p(): any { return this.db; }

  async process(job: Job<any>): Promise<void> {
    if (job.name !== 'scheduler-recovery') {
      return;
    }

    // Acquire global recovery lock to avoid multiple worker instances scanning concurrently
    const lockKey = 'lock:scheduler-recovery-leader';
    const lockToken = `${process.pid}-${Date.now()}`;
    const acquired = await this.redis.set(lockKey, lockToken, 'PX', LOCK_TTL_MS, 'NX');

    if (!acquired) {
      this.logger.log({ message: 'Scheduler recovery scanner: skipped (leader lock active)' });
      return;
    }

    const releaseLua = `
      if redis.call("get",KEYS[1]) == ARGV[1] then
        return redis.call("del",KEYS[1])
      else
        return 0
      end`;

    try {
      const now = new Date();
      // Scan for scheduled/due publish jobs that are in the past but not completed or cancelled
      const stalledJobs = await this.p.publishJob.findMany({
        where: {
          status: { in: ['SCHEDULED', 'DUE', 'RETRYING'] },
          publishAtUtc: { lte: now },
          // Filter out jobs currently locked by a worker (unless lock expired)
          OR: [
            { lockedAt: null },
            { lockedAt: { lte: new Date(Date.now() - LOCK_TTL_MS) } }
          ]
        },
        take: RECOVERY_BATCH_SIZE,
        orderBy: { publishAtUtc: 'asc' }
      });

      if (stalledJobs.length === 0) {
        return;
      }

      this.logger.log({ message: `Scheduler recovery scanner: found ${stalledJobs.length} potentially stalled jobs` });

      for (const pJob of stalledJobs) {
        // Enqueue the job back into scheduled-publication queue safely.
        // The ScheduledPublicationWorker is idempotent and checks the version.
        const correlationId = `recovery-${pJob.id}-${Date.now()}`;
        
        // Build job config
        const delayMs = pJob.publishAtUtc.getTime() - Date.now();
        await this.scheduledQueue.add(
          'scheduled-publication',
          {
            publishJobId: pJob.id,
            workspaceId: pJob.workspaceId,
            scheduleVersion: pJob.scheduleVersion,
            correlationId,
            createdAt: new Date().toISOString()
          },
          {
            delay: delayMs > 0 ? delayMs : 0,
            jobId: `scheduled-pub-${pJob.id}-v${pJob.scheduleVersion}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 }
          }
        );

        this.logger.log({
          message: 'Scheduler recovery scanner: re-enqueued job',
          publishJobId: pJob.id,
          version: pJob.scheduleVersion
        });
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error({ message: 'Error running scheduler recovery scan', error: error.message, stack: error.stack });
    } finally {
      try {
        await this.redis.eval(releaseLua, 1, lockKey, lockToken);
      } catch { /* ignore */ }
    }
  }
}
