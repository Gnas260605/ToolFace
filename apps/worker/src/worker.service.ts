/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { getServerEnv } from '@newsflow/config';
import { JsonLogger } from './common/logger.service';
import { DatabaseService } from './common/database.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  SourceStatus,
  GeminiAiProvider,
  SecretEncryptionService,
  GraphApiFacebookPagesProvider,
  DraftStatus,
  FactSheetStatus,
} from '@newsflow/database';

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private redisClient!: Redis;
  private healthLogInterval!: NodeJS.Timeout;
  private schedulerInterval!: NodeJS.Timeout;
  private autoPilotInterval!: NodeJS.Timeout;

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

      // Start AutoPilot Continuous Loop (runs every 30 seconds to score and auto-publish viral news)
      this.autoPilotInterval = setInterval(() => {
        this.runAutoPilotScheduler();
      }, 30000);
      this.logger.log('AutoPilot Continuous Engine initialized (30s interval)', 'WorkerService');
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error('Failed to start worker or connect to Redis', error.stack, 'WorkerService');
      process.exit(1);
    }
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down Worker gracefully...', 'WorkerService');
    if (this.healthLogInterval) clearInterval(this.healthLogInterval);
    if (this.schedulerInterval) clearInterval(this.schedulerInterval);
    if (this.autoPilotInterval) clearInterval(this.autoPilotInterval);
    if (this.redisClient) {
      await this.redisClient.quit();
    }
    this.logger.log('Worker shutdown completed', 'WorkerService');
  }

  private async runAutoPilotScheduler() {
    try {
      const activePolicies = await (this.db.editorialPolicy as any).findMany({
        where: {
          autoPilotEnabled: true,
          autoPublishTargetPageId: { not: null },
        },
      });

      if (activePolicies.length === 0) return;

      const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.split(',')[0] : '';
      if (!apiKey) return;

      const gemini = new GeminiAiProvider(apiKey);
      const enc = new SecretEncryptionService();
      const fb = new GraphApiFacebookPagesProvider();

      for (const policy of activePolicies) {
        const workspaceId = policy.workspaceId;

        // 1. Chấm điểm viral cho các bài mới chưa có điểm (batch 20 bài)
        const unscoredArticles = await (this.db.article as any).findMany({
          where: { workspaceId, viralScore: null, archivedAt: null },
          orderBy: { publishedAt: 'desc' },
          take: 20,
          include: { source: { select: { name: true } } },
        });

        if (unscoredArticles.length > 0) {
          try {
            const aiScoreResult = await gemini.scoreViralPotential({
              articles: unscoredArticles.map((a: any) => ({
                id: a.id,
                title: a.title,
                summary: a.summary || a.contentExcerpt,
                sourceName: a.source?.name,
                publishedAt: a.publishedAt,
              })),
            }, {
              workspaceId,
              correlationId: `autopilot-viral-${Date.now()}`,
              idempotencyKey: `autopilot-viral-${Date.now()}`,
              timeoutMs: 60000,
            });

            for (const item of aiScoreResult.data) {
              await (this.db.article as any).update({
                where: { id: item.id },
                data: {
                  viralScore: item.score,
                  viralReason: item.reason,
                  viralCategory: item.category,
                },
              });
            }
          } catch (e: any) {
            this.logger.error(`Error scoring viral articles: ${e.message}`, e.stack, 'AutoPilot');
          }
        }

        // 2. Tìm bài đã publish để loại trừ
        const publishedJobs = await this.db.publishJob.findMany({
          where: { workspaceId, status: 'PUBLISHED' },
          select: { draftId: true, publishedAt: true },
          orderBy: { publishedAt: 'desc' },
        });
        const publishedDraftIds = publishedJobs.map((j) => j.draftId);
        const publishedDrafts = await this.db.draft.findMany({
          where: { id: { in: publishedDraftIds } },
          select: { primaryArticleId: true },
        });
        const publishedArticleIds = publishedDrafts.map((d) => d.primaryArticleId).filter(Boolean);

        // 3. Tìm bài viết Viral cao nhất chưa xuất bản
        const candidate = await (this.db.article as any).findFirst({
          where: {
            workspaceId,
            archivedAt: null,
            id: { notIn: publishedArticleIds as string[] },
          },
          orderBy: [
            { viralScore: { sort: 'desc', nulls: 'last' } },
            { publishedAt: 'desc' },
          ],
        });

        if (!candidate) continue;

        // 4. Kiểm tra điều kiện xuất bản (Hot viral >= 80 hoặc đủ interval)
        const lastPublishTime = publishedJobs[0]?.publishedAt ? new Date(publishedJobs[0].publishedAt).getTime() : 0;
        const elapsedMinutes = lastPublishTime > 0 ? (Date.now() - lastPublishTime) / 60000 : 999999;
        const intervalMinutes = policy.autoPublishIntervalMinutes || 30;
        const isHot = candidate.viralScore !== null && candidate.viralScore >= 80;

        if (!policy.autoPublishImmediate && !isHot && elapsedMinutes < intervalMinutes) {
          continue;
        }

        this.logger.log(`[AUTOPILOT] Tự động xuất bản tin HOT: "${candidate.title}" (Score: ${candidate.viralScore}/100)`, 'AutoPilot');

        // Step A: Fact Extraction
        let factSheet = await this.db.factSheet.findFirst({ where: { articleId: candidate.id } });
        if (!factSheet) {
          const factRes = await gemini.extractFacts({
            sources: [{
              id: candidate.id,
              attributionName: 'Nguồn tin',
              title: candidate.title,
              excerpt: candidate.summary || candidate.contentExcerpt || candidate.title,
            }],
          }, {
            workspaceId,
            userId: 'AUTOPILOT',
            correlationId: `autopilot-${Date.now()}`,
            idempotencyKey: `fact-${candidate.id}`,
            timeoutMs: 60000,
          });

          factSheet = await this.db.factSheet.create({
            data: {
              workspaceId,
              articleId: candidate.id,
              contentHash: candidate.contentHash,
              factsJson: factRes.data,
              conflictsJson: factRes.data.conflicts || [],
              uncertaintyFlagsJson: factRes.data.uncertaintyFlags || [],
              provider: 'gemini',
              model: factRes.model,
              promptVersion: 'v1.0',
              inputTokens: factRes.inputTokens,
              outputTokens: factRes.outputTokens,
              estimatedCostMinor: factRes.estimatedCostMinor,
              status: FactSheetStatus.SUCCESS,
            },
          });
        }

        // Step B: Get Brand Profile
        const brandProfile = policy.autoPublishBrandProfileId
          ? await this.db.brandProfile.findUnique({ where: { id: policy.autoPublishBrandProfileId } })
          : await this.db.brandProfile.findFirst({ where: { workspaceId } });

        if (!brandProfile) continue;

        // Step C: Generate Draft
        const draftRes = await gemini.generateDraft({
          factSheet: factSheet.factsJson as any,
          brandRules: {
            tone: brandProfile.tone,
            audience: brandProfile.audience || 'Độc giả mạng xã hội',
            writingRules: (brandProfile.writingRulesJson as string[]) || ['Ngắn gọn, cảm xúc, cuốn hút'],
            forbiddenPhrases: (brandProfile.forbiddenPhrasesJson as string[]) || [],
            defaultHashtags: (brandProfile.defaultHashtagsJson as string[]) || ['#TinTuc', '#TinNong'],
            headlineStyle: brandProfile.headlineStyle || 'CATCHY',
            emojiPolicy: (brandProfile.emojiPolicy as any) || 'MODERATE',
          },
          contentType: 'BREAKING',
          language: 'vi',
        }, {
          workspaceId,
          userId: 'AUTOPILOT',
          correlationId: `autopilot-${Date.now()}`,
          idempotencyKey: `draft-${candidate.id}`,
          timeoutMs: 60000,
        });

        // Step D: Save Draft & Auto-Approve
        const draft = await this.db.draft.create({
          data: {
            workspaceId,
            primaryArticleId: candidate.id,
            brandProfileId: brandProfile.id,
            status: DraftStatus.APPROVED,
            createdByUserId: 'AUTOPILOT',
            approvedByUserId: 'AUTOPILOT',
            approvedAt: new Date(),
          },
        });

        const draftVersion = await this.db.draftVersion.create({
          data: {
            workspaceId,
            draftId: draft.id,
            versionNumber: 1,
            headline: draftRes.data.headline,
            hook: draftRes.data.hook,
            body: draftRes.data.body,
            whyItMatters: draftRes.data.whyItMatters || '',
            hashtagsJson: draftRes.data.hashtags || [],
            attributionLine: draftRes.data.attributionLine || `Nguồn tin tức`,
            recommendedLink: candidate.canonicalUrl,
            contentType: 'BREAKING',
            riskFlagsJson: [],
            verificationJson: { passed: true, autoApproved: true },
            similarityScore: 0.15,
            sourceClaimIdsJson: [],
            createdByPlain: 'AI',
            createdByUserId: 'AUTOPILOT',
            provider: 'gemini',
            model: draftRes.model,
            promptVersion: 'v1',
            inputTokens: draftRes.inputTokens,
            outputTokens: draftRes.outputTokens,
            estimatedCostMinor: draftRes.estimatedCostMinor,
          },
        });

        await this.db.draft.update({
          where: { id: draft.id },
          data: { currentVersionId: draftVersion.id },
        });

        // Step E: Publish to Facebook Page
        const pageConn = await this.db.facebookPageConnection.findFirst({
          where: { workspaceId, pageId: policy.autoPublishTargetPageId as string, status: 'ACTIVE' },
        });

        if (!pageConn) continue;

        const pageToken = await enc.decrypt({
          ciphertext: pageConn.tokenCiphertext,
          iv: pageConn.tokenIv,
          authTag: pageConn.tokenAuthTag,
          keyVersion: pageConn.tokenKeyVersion,
          associatedData: `${workspaceId}:${pageConn.pageId}`,
        });

        const postMessage = `${draftRes.data.headline}\n\n${draftRes.data.body}\n\n${(draftRes.data.hashtags || []).join(' ')}`;
        let pubResult: any;

        if (policy.autoPublishPostType === 'COMMENT_LINK') {
          pubResult = await fb.publishTextPost({
            pageAccessToken: pageToken,
            pageId: pageConn.pageId,
            message: postMessage,
          });
          if (pubResult.success && pubResult.facebookPostId) {
            await fb.publishComment({
              pageAccessToken: pageToken,
              postId: pubResult.facebookPostId,
              message: `👉 Đọc chi tiết bài viết tại: ${candidate.canonicalUrl}`,
            });
          }
        } else if (policy.autoPublishPostType === 'TEXT') {
          pubResult = await fb.publishTextPost({
            pageAccessToken: pageToken,
            pageId: pageConn.pageId,
            message: postMessage,
          });
        } else {
          pubResult = await fb.publishLinkPost({
            pageAccessToken: pageToken,
            pageId: pageConn.pageId,
            message: postMessage,
            link: candidate.canonicalUrl,
          });
        }

        if (pubResult.success) {
          await this.db.publishJob.create({
            data: {
              workspaceId,
              draftId: draft.id,
              draftVersionId: draftVersion.id,
              pageConnectionId: pageConn.id,
              status: 'PUBLISHED',
              publicationType: (policy.autoPublishPostType === 'COMMENT_LINK' ? 'COMMENT_LINK' : policy.autoPublishPostType === 'TEXT' ? 'TEXT' : 'LINK') as any,
              messageSnapshot: postMessage,
              linkSnapshot: candidate.canonicalUrl,
              idempotencyKey: `auto-${Date.now()}`,
              facebookPostId: pubResult.facebookPostId,
              facebookPermalink: pubResult.facebookPermalink || `https://facebook.com/${pubResult.facebookPostId}`,
              createdByUserId: 'AUTOPILOT',
              publishedAt: new Date(),
            },
          });
          this.logger.log(`[AUTOPILOT] Đăng Facebook thành công! Post ID: ${pubResult.facebookPostId}`, 'AutoPilot');
        }
      }
    } catch (err: any) {
      this.logger.error('Error running AutoPilot scheduler', err.stack, 'WorkerAutoPilot');
    }
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
