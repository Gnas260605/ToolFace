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
import { GeminiAiProvider, OpenAiProvider, OpenRouterAiProvider, FallbackAiProvider, AiProvider } from '@newsflow/database';

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
      useFactory: (db: DatabaseService) => {
        const primaryType = process.env.AI_PROVIDER || 'gemini';
        const available: { type: string; provider: AiProvider; key?: string }[] = [];

        if (process.env.GEMINI_API_KEY) {
          available.push({
            type: 'gemini',
            provider: new GeminiAiProvider(process.env.GEMINI_API_KEY),
            key: process.env.GEMINI_API_KEY,
          });
        }
        if (process.env.OPENAI_API_KEY) {
          available.push({
            type: 'openai',
            provider: new OpenAiProvider(process.env.OPENAI_API_KEY),
            key: process.env.OPENAI_API_KEY,
          });
        }
        if (process.env.OPENROUTER_API_KEY) {
          available.push({
            type: 'openrouter',
            provider: new OpenRouterAiProvider(process.env.OPENROUTER_API_KEY),
            key: process.env.OPENROUTER_API_KEY,
          });
        }

        const activeProviders = available.filter((p) => p.type === primaryType || !!p.key);
        const hasPrimary = activeProviders.some((p) => p.type === primaryType);
        if (!hasPrimary) {
          if (primaryType === 'gemini') {
            activeProviders.push({ type: 'gemini', provider: new GeminiAiProvider(process.env.GEMINI_API_KEY || '') });
          } else if (primaryType === 'openai') {
            activeProviders.push({ type: 'openai', provider: new OpenAiProvider(process.env.OPENAI_API_KEY || '') });
          } else if (primaryType === 'openrouter') {
            activeProviders.push({ type: 'openrouter', provider: new OpenRouterAiProvider(process.env.OPENROUTER_API_KEY || '') });
          }
        }

        activeProviders.sort((a, b) => {
          if (a.type === primaryType) return -1;
          if (b.type === primaryType) return 1;
          return 0;
        });

        const providersList = activeProviders.map((p) => ({ type: p.type, provider: p.provider }));
        return new FallbackAiProvider(providersList, db);
      },
      inject: [DatabaseService],
    },
  ],
})
export class AppModule {}
