/* eslint-disable @typescript-eslint/no-explicit-any */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { DatabaseService } from '../common/database.service';
import { JsonLogger } from '../common/logger.service';
import Redis from 'ioredis';

const OUTBOX_BATCH_SIZE = parseInt(process.env.OUTBOX_BATCH_SIZE ?? '100', 10);
const LOCK_TTL_MS = 30000;

@Processor('maintenance', { concurrency: 1 })
export class OutboxRelayProcessor extends WorkerHost {
  private readonly redis: Redis;

  constructor(
    private readonly db: DatabaseService,
    private readonly logger: JsonLogger,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {
    super();
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.redis = new Redis(redisUrl, { lazyConnect: true, enableReadyCheck: false });
  }

  private get p(): any { return this.db; }

  async process(job: Job<any>): Promise<void> {
    if (job.name !== 'outbox-relay') {
      return;
    }

    // Leader election for outbox relay processing
    const lockKey = 'lock:outbox-relay-leader';
    const lockToken = `${process.pid}-${Date.now()}`;
    const acquired = await this.redis.set(lockKey, lockToken, 'PX', LOCK_TTL_MS, 'NX');

    if (!acquired) {
      return;
    }

    const releaseLua = `
      if redis.call("get",KEYS[1]) == ARGV[1] then
        return redis.call("del",KEYS[1])
      else
        return 0
      end`;

    try {
      // 1. Fetch pending outbox events
      const pendingEvents = await this.p.outboxEvent.findMany({
        where: {
          status: { in: ['PENDING', 'FAILED'] },
          availableAt: { lte: new Date() },
          attemptCount: { lt: parseInt(process.env.OUTBOX_MAX_ATTEMPTS ?? '10', 10) }
        },
        take: OUTBOX_BATCH_SIZE,
        orderBy: { createdAt: 'asc' }
      });

      if (pendingEvents.length === 0) {
        return;
      }

      this.logger.log({ message: `Outbox relay: processing ${pendingEvents.length} events` });

      for (const event of pendingEvents) {
        // Mark as PROCESSING
        await this.p.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'PROCESSING',
            attemptCount: { increment: 1 }
          }
        });

        try {
          // Route event based on type/aggregate
          // In Phase 5, all publish and facebook connection/source events are routed to notifications queue
          await this.notificationsQueue.add(
            'notify',
            {
              outboxEventId: event.id,
              eventType: event.eventType,
              workspaceId: event.workspaceId,
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              payloadJson: event.payloadJson as Record<string, unknown>,
              correlationId: event.correlationId ?? undefined
            },
            {
              jobId: `outbox-relay-${event.id}`,
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 }
            }
          );

          // Mark as PROCESSED
          await this.p.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'PROCESSED',
              processedAt: new Date()
            }
          });
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.logger.error({ message: `Outbox relay failed for event ${event.id}`, error: error.message });

          await this.p.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'FAILED',
              lastError: error.message
            }
          });
        }
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error({ message: 'Error running outbox relay processing loop', error: error.message });
    } finally {
      try {
        await this.redis.eval(releaseLua, 1, lockKey, lockToken);
      } catch { /* ignore */ }
    }
  }
}
