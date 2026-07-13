import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WorkerService } from './worker.service';
import { JsonLogger } from './common/logger.service';
import { SourcePollProcessor } from './processors/source-poll.processor';
import { ArticleExtractionProcessor } from './processors/article-extraction.processor';
import { StoryClusteringProcessor } from './processors/story-clustering.processor';
import { FactExtractionProcessor } from './processors/fact-extraction.processor';
import { DraftGenerationProcessor } from './processors/draft-generation.processor';
import { DraftVerificationProcessor } from './processors/draft-verification.processor';
import { FacebookPublishWorker } from './processors/facebook-publish.worker';
import { ScheduledPublicationWorker } from './processors/scheduled-publication.worker';
import { SchedulerRecoveryProcessor } from './processors/scheduler-recovery.processor';
import { NotificationProcessor } from './processors/notification.processor';
import { NotificationEmailProcessor } from './processors/notification-email.processor';
import { OutboxRelayProcessor } from './processors/outbox-relay.processor';
import { DatabaseService } from './common/database.service';
import { getServerEnv } from '@newsflow/config';
import { GeminiAiProvider, MockAiProvider } from '@newsflow/database';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: new URL(getServerEnv().REDIS_URL).hostname,
        port: parseInt(new URL(getServerEnv().REDIS_URL).port || '6379', 10),
        password: new URL(getServerEnv().REDIS_URL).password ? decodeURIComponent(new URL(getServerEnv().REDIS_URL).password) : undefined,
      },
    }),
    BullModule.registerQueue(
      { name: 'source-poll' },
      { name: 'article-extraction' },
      { name: 'story-clustering' },
      { name: 'fact-extraction' },
      { name: 'draft-generation' },
      { name: 'draft-verification' },
      { name: 'facebook-publish' },
      { name: 'scheduled-publication' },
      { name: 'notifications' },
      { name: 'notification-email' },
      { name: 'maintenance' },
    ),
  ],
  providers: [
    WorkerService,
    JsonLogger,
    DatabaseService,
    SourcePollProcessor,
    ArticleExtractionProcessor,
    StoryClusteringProcessor,
    FactExtractionProcessor,
    DraftGenerationProcessor,
    DraftVerificationProcessor,
    FacebookPublishWorker,
    ScheduledPublicationWorker,
    SchedulerRecoveryProcessor,
    NotificationProcessor,
    NotificationEmailProcessor,
    OutboxRelayProcessor,
    {
      provide: 'AiProvider',
      useFactory: () => {
        const providerType = process.env.AI_PROVIDER || 'mock';
        if (providerType === 'gemini') {
          return new GeminiAiProvider(process.env.GEMINI_API_KEY || '');
        }
        return new MockAiProvider();
      },
    },
  ],
})
export class AppModule {}
