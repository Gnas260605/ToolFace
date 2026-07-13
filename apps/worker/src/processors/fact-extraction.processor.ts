/* eslint-disable @typescript-eslint/no-explicit-any */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { JsonLogger } from '../common/logger.service';
import {
  AiProvider,
  FactSheetStatus,
  PromptTaskType,
  buildPrompt,
  calculateHash,
} from '@newsflow/database';

@Processor('fact-extraction')
@Injectable()
export class FactExtractionProcessor extends WorkerHost {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(JsonLogger) private readonly logger: JsonLogger,
    @Inject('AiProvider') private readonly ai: AiProvider,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { articleId, clusterId, workspaceId, correlationId, userId } = job.data;
    this.logger.log(`Processing fact extraction job for workspace ${workspaceId}`, 'FactExtractionProcessor');

    // 1. Fetch source articles
    const articles = [];
    if (articleId) {
      const art = await this.db.article.findFirst({
        where: { id: articleId, workspaceId, archivedAt: null },
        include: { source: true },
      });
      if (art) articles.push(art);
    } else if (clusterId) {
      const clusterArticles = await this.db.storyClusterArticle.findMany({
        where: { clusterId, cluster: { workspaceId } },
        include: { article: { include: { source: true } } },
        orderBy: { article: { publishedAt: 'desc' } },
        take: 5, // limit to 5 sources maximum
      });
      for (const ca of clusterArticles) {
        if (ca.article && !ca.article.archivedAt) {
          articles.push(ca.article);
        }
      }
    }

    if (articles.length === 0) {
      this.logger.error(`No active articles found for fact extraction`, '', 'FactExtractionProcessor');
      return;
    }

    // Sort articles deterministically by publishedAt or ID
    articles.sort((a, b) => a.id.localeCompare(b.id));

    // 2. Compute input content hash to check cache
    const combinedContent = articles.map((a) => (a.contentExcerpt || a.summary || '')).join('\n');
    const contentHash = calculateHash(combinedContent);

    // Look for valid cached fact sheet
    const cached = await this.db.factSheet.findFirst({
      where: {
        workspaceId,
        contentHash,
        status: FactSheetStatus.SUCCESS,
      },
    });

    if (cached) {
      this.logger.log(`Found valid cached fact sheet ${cached.id}, skipping AI call`, 'FactExtractionProcessor');
      return;
    }

    // 3. Build AI Prompts
    const promptSources = articles.map((a) => ({
      id: a.id,
      attributionName: a.source.attributionName,
      title: a.title,
      excerpt: a.contentExcerpt || a.summary || a.title,
    }));

    const replacements = {
      SOURCES: JSON.stringify(promptSources, null, 2),
    };

    const { user } = buildPrompt('FACT_EXTRACTION', 'v1', replacements);

    // Create a pending fact sheet record
    const factSheet = await this.db.factSheet.create({
      data: {
        workspaceId,
        articleId: articleId || null,
        clusterId: clusterId || null,
        contentHash,
        factsJson: {},
        provider: 'mock',
        model: 'mock',
        promptVersion: 'v1',
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostMinor: 0,
        status: FactSheetStatus.PROCESSING,
      },
    });

    try {
      const context = {
        workspaceId,
        userId: userId || 'SYSTEM',
        correlationId,
        idempotencyKey: `fact-extract-${factSheet.id}`,
        timeoutMs: 60000,
      };

      // Call AI provider
      const result = await this.ai.extractFacts({ sources: promptSources }, context);

      // Save fact sheet results
      await this.db.factSheet.update({
        where: { id: factSheet.id },
        data: {
          factsJson: result.data as any,
          conflictsJson: result.data.conflicts as any,
          uncertaintyFlagsJson: result.data.uncertaintyFlags as any,
          provider: result.provider,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          estimatedCostMinor: result.estimatedCostMinor,
          status: FactSheetStatus.SUCCESS,
        },
      });

      // Log usage event
      await this.db.aiUsageEvent.create({
        data: {
          workspaceId,
          userId: userId || 'SYSTEM',
          taskType: PromptTaskType.FACT_EXTRACTION,
          provider: result.provider,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          estimatedCostMinor: result.estimatedCostMinor,
          requestHash: calculateHash(user),
          status: 'SUCCESS',
          durationMs: result.durationMs,
          occurredAt: new Date(),
        },
      });

      // Audit log
      await this.db.auditLog.create({
        data: {
          workspaceId,
          actorId: userId || 'SYSTEM',
          actorType: userId ? 'USER' : 'SYSTEM',
          action: 'fact_sheet.completed',
          resource: 'fact_sheet',
          resourceId: factSheet.id,
          afterValues: {
            provider: result.provider,
            model: result.model,
            cost: result.estimatedCostMinor,
          },
          correlationId,
        },
      });

      this.logger.log(`Successfully extracted facts for fact sheet ${factSheet.id}`, 'FactExtractionProcessor');
    } catch (err: any) {
      this.logger.error(`Error extracting facts: ${err.message}`, err.stack, 'FactExtractionProcessor');

      await this.db.factSheet.update({
        where: { id: factSheet.id },
        data: {
          status: FactSheetStatus.FAILED,
          errorCode: err.message || 'AI_EXTRACTION_FAILED',
        },
      });

      await this.db.aiUsageEvent.create({
        data: {
          workspaceId,
          userId: userId || 'SYSTEM',
          taskType: PromptTaskType.FACT_EXTRACTION,
          provider: 'mock',
          model: 'mock',
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostMinor: 0,
          requestHash: calculateHash(user),
          status: 'FAILED',
          durationMs: 0,
          occurredAt: new Date(),
        },
      });

      await this.db.auditLog.create({
        data: {
          workspaceId,
          actorId: userId || 'SYSTEM',
          actorType: userId ? 'USER' : 'SYSTEM',
          action: 'fact_sheet.failed',
          resource: 'fact_sheet',
          resourceId: factSheet.id,
          afterValues: { error: err.message },
          correlationId,
        },
      });

      throw err; // retry if transient BullMQ retry policy allows it
    }
  }
}
