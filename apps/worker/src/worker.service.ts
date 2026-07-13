/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { getServerEnv } from '@newsflow/config';
import { JsonLogger } from './common/logger.service';
import { DatabaseService } from './common/database.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SourceStatus } from '@newsflow/database';

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private redisClient!: Redis;
  private healthLogInterval!: NodeJS.Timeout;
  private schedulerInterval!: NodeJS.Timeout;

  constructor(
    @Inject(JsonLogger) private readonly logger: JsonLogger,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @InjectQueue('source-poll') private readonly sourcePollQueue: Queue,
    @InjectQueue('maintenance') private readonly maintenanceQueue: Queue,
  ) {}

  async onModuleInit() {
    this.logger.log('Starting Worker Application...', 'WorkerService');
    const env = getServerEnv();

    try {
      this.redisClient = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 3,
      });

      await this.redisClient.ping();
      this.logger.log('Successfully connected to Redis', 'WorkerService');

      // Initialize repeatable/cron jobs in BullMQ
      await this.maintenanceQueue.add('outbox-relay', {}, {
        repeat: { every: 5000 },
        jobId: 'outbox-relay-repeat'
      });
      await this.maintenanceQueue.add('scheduler-recovery', {}, {
        repeat: { every: 30000 },
        jobId: 'scheduler-recovery-repeat'
      });
      this.logger.log('Registered recurring maintenance/outbox jobs', 'WorkerService');

      // Start health checks logging
      this.healthLogInterval = setInterval(() => {
        this.logWorkerHealth();
      }, 60000);
      this.logWorkerHealth();

      // Start Automatic Polling Scheduler (runs every 10 seconds for rapid dev resolution)
      this.schedulerInterval = setInterval(() => {
        this.runScheduler();
      }, 10000);
      this.logger.log('Automatic Polling Scheduler initialized', 'WorkerService');
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error('Failed to start worker or connect to Redis', error.stack, 'WorkerService');
      process.exit(1);
    }
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down Worker gracefully...', 'WorkerService');
    if (this.healthLogInterval) {
      clearInterval(this.healthLogInterval);
    }
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
    }
    if (this.redisClient) {
      await this.redisClient.quit();
    }
    this.logger.log('Worker shutdown completed', 'WorkerService');
  }

  private async runScheduler() {
    try {
      const now = new Date();
      const dueSources = await this.db.source.findMany({
        where: {
          status: SourceStatus.ACTIVE,
          nextPollAt: { lte: now },
          deletedAt: null,
        },
        take: 50,
      });

      if (dueSources.length === 0) {
        return;
      }

      this.logger.log(`Found ${dueSources.length} sources due for polling`, 'WorkerScheduler');

      for (const source of dueSources) {
        const nextPoll = new Date(Date.now() + source.pollIntervalSeconds * 1000);

        // Optimistic locking: update nextPollAt first to secure the task
        const updated = await this.db.source.updateMany({
          where: {
            id: source.id,
            nextPollAt: source.nextPollAt, // ensure nobody else updated it in the meantime
          },
          data: {
            nextPollAt: nextPoll,
          },
        });

        if (updated.count > 0) {
          const correlationId = `auto-poll-${source.id}-${Math.floor(now.getTime() / 1000)}`;
          
          await this.sourcePollQueue.add(
            'poll',
            {
              sourceId: source.id,
              workspaceId: source.workspaceId,
              correlationId,
              manual: false,
            },
            {
              jobId: correlationId,
              deduplication: {
                id: correlationId,
              },
            },
          );

          this.logger.log(`Scheduled poll job for source ${source.id}`, 'WorkerScheduler');
        }
      }
    } catch (err: any) {
      this.logger.error('Error running worker scheduler', err.stack, 'WorkerScheduler');
    }
  }

  private async logWorkerHealth() {
    try {
      const memoryUsage = process.memoryUsage();
      const redisStatus = this.redisClient ? await this.redisClient.ping() : 'disconnected';

      this.logger.log(
        {
          message: 'Worker health check status log',
          memoryRssMb: Math.round(memoryUsage.rss / 1024 / 1024),
          memoryHeapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          memoryHeapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          redisStatus: redisStatus === 'PONG' ? 'healthy' : 'unhealthy',
        },
        'WorkerHealthMonitor',
      );
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(
        'Error during worker health check logging',
        error.stack,
        'WorkerHealthMonitor',
      );
    }
  }
}
