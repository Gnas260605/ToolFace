/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { JsonLogger } from '../common/logger.service';
import {
  normalizeUrl,
  normalizeTitle,
  calculateHash,
  SourceStatus,
  SourceHealthStatus,
  PollRunStatus,
  ArticleExtractionStatus,
  ArticleRiskLevel,
  Source,
} from '@newsflow/database';
import sanitizeHtml from 'sanitize-html';
import {
  RssAdapter,
  GoogleTrendsAdapter,
  RedditAdapter,
  YouTubeAdapter,
  ScraperAdapter,
  SourceAdapter,
} from '../adapters';

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

  private getAdapter(source: Source): SourceAdapter {
    const url = source.feedUrl.toLowerCase();
    if (url.includes('trends.google') || url.includes('google.com/trends')) {
      return new GoogleTrendsAdapter();
    }
    if (url.includes('reddit.com') || url.startsWith('r/')) {
      return new RedditAdapter();
    }
    if (url.includes('youtube.com') || (source.feedUrl.startsWith('UC') && source.feedUrl.length >= 24)) {
      return new YouTubeAdapter();
    }
    if (source.sourceType === 'APPROVED_WEB_PAGE') {
      return new ScraperAdapter();
    }
    return new RssAdapter();
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
      // 2. Fetch via appropriate adapter
      const adapter = this.getAdapter(source);
      const entries = await adapter.fetch(source);

      let articlesCreated = 0;
      let duplicatesSkipped = 0;

      // 3. Loop & Normalize entries
      for (const entry of entries) {
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

        // Check Layer 2: Content Hash or Title Hash uniqueness per workspace (Ingestion Dedup)
        const cleanSummary = entry.summary
          ? sanitizeHtml(entry.summary, { allowedTags: [], allowedAttributes: {} }).trim()
          : '';

        const cHash = calculateHash(cleanSummary);
        const tHash = calculateHash(normTitle);

        const existingDuplicate = await this.db.article.findFirst({
          where: {
            workspaceId,
            OR: [
              { contentHash: cHash },
              { normalizedTitleHash: tHash },
            ],
          },
        });

        if (existingDuplicate) {
          duplicatesSkipped++;
          continue;
        }

        let imageUrl = entry.imageUrl || null;
        if (!imageUrl && entry.summary) {
          const match = entry.summary.match(/<img[^>]+src=["']([^"']+)["']/i);
          if (match) {
            imageUrl = match[1];
          }
        }

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
            summary: cleanSummary || null,
            author: entry.author || null,
            publishedAt: entry.publishedAt || new Date(),
            language: source.language,
            category: source.category,
            imageUrl,
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

      // 4. Update success health state
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
          httpStatus: 200,
          entriesReceived: entries.length,
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

