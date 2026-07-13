/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { JsonLogger } from '../common/logger.service';
import {
  safeFetch,
  parseFeed,
  normalizeUrl,
  normalizeTitle,
  calculateHash,
  SourceStatus,
  SourceHealthStatus,
  PollRunStatus,
  ArticleExtractionStatus,
  ArticleRiskLevel,
} from '@newsflow/database';

@Processor('source-poll')
@Injectable()
export class SourcePollProcessor extends WorkerHost {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(JsonLogger) private readonly logger: JsonLogger,
    @InjectQueue('article-extraction') private readonly extractionQueue: Queue,
    @InjectQueue('story-clustering') private readonly clusteringQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { sourceId, workspaceId, correlationId, manual } = job.data;
    this.logger.log(`Processing poll job for source ${sourceId} in workspace ${workspaceId}`, 'SourcePollProcessor');

    // 1. Fetch source state
    const source = await this.db.source.findFirst({
      where: { id: sourceId, workspaceId, deletedAt: null },
    });

    if (!source) {
      this.logger.error(`Source ${sourceId} not found or deleted`, '', 'SourcePollProcessor');
      return;
    }

    if (!manual && (source.status === SourceStatus.DISABLED || source.status === SourceStatus.AUTO_DISABLED)) {
      this.logger.log(`Source ${sourceId} is disabled, skipping automatic poll`, 'SourcePollProcessor');
      return;
    }

    // Create poll run record
    const pollRun = await this.db.sourcePollRun.create({
      data: {
        workspaceId,
        sourceId,
        status: PollRunStatus.PENDING,
        correlationId,
      },
    });

    try {
      // 2. Safely Fetch
      const res = await safeFetch(source.feedUrl, {
        allowHttpInDev: true,
        maxBytes: 5 * 1024 * 1024,
      });

      // 3. Parse Feed
      const parsed = parseFeed(res.body, source.feedUrl);

      let articlesCreated = 0;
      let duplicatesSkipped = 0;

      // 4. Loop & Normalize entries
      for (const entry of parsed.entries) {
        const canonical = normalizeUrl(entry.canonicalUrl);
        const originalTitle = entry.title;
        const normTitle = normalizeTitle(originalTitle);

        // Check Layer 1: Canonical URL uniqueness per workspace
        const existingArticle = await this.db.article.findFirst({
          where: { workspaceId, canonicalUrl: canonical },
        });

        if (existingArticle) {
          duplicatesSkipped++;
          continue;
        }

        const summaryText = entry.summary || '';
        const cHash = calculateHash(summaryText);
        const tHash = calculateHash(normTitle);

        // Check if allow page extraction
        const shouldExtract = source.allowPageExtraction;
        const extractStatus = shouldExtract ? ArticleExtractionStatus.PENDING : ArticleExtractionStatus.NOT_REQUESTED;

        // Insert Article
        const article = await this.db.article.create({
          data: {
            workspaceId,
            sourceId,
            canonicalUrl: canonical,
            originalUrl: entry.originalUrl,
            title: originalTitle,
            summary: entry.summary,
            author: entry.author || null,
            publishedAt: entry.publishedAt || new Date(),
            language: source.language,
            category: source.category,
            imageUrl: entry.imageUrl || null,
            contentHash: cHash,
            normalizedTitle: normTitle,
            normalizedTitleHash: tHash,
            extractionStatus: extractStatus,
            riskLevel: ArticleRiskLevel.LOW,
            metadataJson: entry.rawMetadata as any,
          },
        });

        articlesCreated++;

        // Enqueue extraction if needed
        if (shouldExtract) {
          await this.extractionQueue.add(
            'extract',
            {
              articleId: article.id,
              workspaceId,
              correlationId,
            },
            {
              jobId: `extract-${article.id}`,
            },
          );
        }

        // Enqueue clustering in all cases
        await this.clusteringQueue.add(
          'cluster',
          {
            articleId: article.id,
            workspaceId,
            correlationId,
          },
          {
            jobId: `cluster-${article.id}`,
          },
        );
      }

      // 5. Update success health state
      const nextPollAt = new Date(Date.now() + source.pollIntervalSeconds * 1000);
      await this.db.source.update({
        where: { id: sourceId },
        data: {
          healthStatus: SourceHealthStatus.HEALTHY,
          consecutiveFailures: 0,
          lastSuccessAt: new Date(),
          lastPolledAt: new Date(),
          nextPollAt,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });

      // Update poll run to SUCCESS
      await this.db.sourcePollRun.update({
        where: { id: pollRun.id },
        data: {
          status: PollRunStatus.SUCCESS,
          finishedAt: new Date(),
          httpStatus: res.status,
          entriesReceived: parsed.entries.length,
          articlesCreated,
          duplicatesSkipped,
        },
      });

      this.logger.log(`Successfully completed polling for source ${sourceId}`, 'SourcePollProcessor');
    } catch (err: any) {
      this.logger.error(`Error polling source ${sourceId}`, err.stack, 'SourcePollProcessor');

      const nextFailures = source.consecutiveFailures + 1;
      let newHealth: SourceHealthStatus = SourceHealthStatus.HEALTHY;
      let newStatus: SourceStatus = source.status;

      if (nextFailures >= 20) {
        newHealth = SourceHealthStatus.DISABLED;
        newStatus = SourceStatus.AUTO_DISABLED;
      } else if (nextFailures >= 5) {
        newHealth = SourceHealthStatus.FAILING;
      } else if (nextFailures >= 2) {
        newHealth = SourceHealthStatus.DEGRADED;
      }

      const nextPollAt = new Date(Date.now() + source.pollIntervalSeconds * 1000);

      await this.db.source.update({
        where: { id: sourceId },
        data: {
          healthStatus: newHealth,
          status: newStatus,
          consecutiveFailures: nextFailures,
          lastPolledAt: new Date(),
          nextPollAt,
          lastErrorCode: 'POLL_FAILED',
          lastErrorMessage: err.message || 'Unknown polling error',
        },
      });

      // Update poll run to FAILED
      await this.db.sourcePollRun.update({
        where: { id: pollRun.id },
        data: {
          status: PollRunStatus.FAILED,
          finishedAt: new Date(),
          errorCode: 'POLL_FAILED',
          sanitizedErrorMessage: err.message || 'Unknown polling error',
        },
      });
    }
  }
}
