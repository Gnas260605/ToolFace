import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { SystemController } from './system.controller';
import { SourcesController } from './sources.controller';
import { ArticlesController } from './articles.controller';
import { BrandProfilesController } from './brand-profiles.controller';
import { DraftsController } from './drafts.controller';
import { AiUsageController } from './ai-usage.controller';
import { FacebookOauthController, FacebookPagesController } from './facebook.controller';
import { PublishController } from './publish.controller';
import { SchedulingController, NotificationsController } from './scheduling.controller';
import { DatabaseService } from './common/database.service';
import { RedisService } from './common/redis.service';
import { JsonLogger } from './common/logger.service';
import { RequestTrackerMiddleware } from './common/request-tracker.middleware';
import { PublishingEligibilityService } from './common/services/publishing-eligibility.service';
import { SaasService } from './common/services/saas.service';
import { getServerEnv } from '@newsflow/config';
import { AdminPhase6Controller, BillingWebhookController, WorkspaceBillingController } from './phase6.controller';

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
  controllers: [
    HealthController,
    SystemController,
    SourcesController,
    ArticlesController,
    BrandProfilesController,
    DraftsController,
    AiUsageController,
    FacebookOauthController,
    FacebookPagesController,
    PublishController,
    SchedulingController,
    NotificationsController,
    WorkspaceBillingController,
    BillingWebhookController,
    AdminPhase6Controller,
  ],
  providers: [DatabaseService, RedisService, JsonLogger, PublishingEligibilityService, SaasService],
  exports: [DatabaseService, RedisService, JsonLogger],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestTrackerMiddleware).forRoutes('*');
  }
}
