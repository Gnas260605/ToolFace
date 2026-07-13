/* eslint-disable @typescript-eslint/no-explicit-any */
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { JsonLogger } from '../common/logger.service';
import {
  AiProvider,
  DraftStatus,
  DraftCreatedByType,
  PromptTaskType,
  FactSheetStatus,
  QuotaManager,
  buildPrompt,
  calculateHash,
} from '@newsflow/database';

@Processor('draft-generation')
@Injectable()
export class DraftGenerationProcessor extends WorkerHost {
  private quotaManager: QuotaManager;

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(JsonLogger) private readonly logger: JsonLogger,
    @Inject('AiProvider') private readonly ai: AiProvider,
    @InjectQueue('draft-verification') private readonly verificationQueue: Queue,
  ) {
    super();
    this.quotaManager = new QuotaManager(this.db as any);
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { draftId, workspaceId, correlationId, userId } = job.data;
    this.logger.log(`Processing draft generation job for draft ${draftId}`, 'DraftGenerationProcessor');

    // 1. Fetch Draft and settings
    const draft = await this.db.draft.findFirst({
      where: { id: draftId, workspaceId },
      include: { brandProfile: true },
    });

    if (!draft) {
      this.logger.error(`Draft ${draftId} not found or access denied`, '', 'DraftGenerationProcessor');
      return;
    }

    // 2. Enforce AI Budget and Quotas
    const quotaCheck = await this.quotaManager.checkQuota(workspaceId);
    if (!quotaCheck.allowed) {
      this.logger.warn(`AI quota check failed for workspace ${workspaceId}: ${quotaCheck.reason}`, 'DraftGenerationProcessor');
      await this.db.draft.update({
        where: { id: draftId },
        data: { status: DraftStatus.GENERATION_FAILED },
      });
      return;
    }

    // 3. Find most recent SUCCESS fact sheet
    const factSheet = await this.db.factSheet.findFirst({
      where: {
        workspaceId,
        OR: [
          { articleId: draft.primaryArticleId || undefined },
          { clusterId: draft.clusterId || undefined },
        ],
        status: FactSheetStatus.SUCCESS,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!factSheet) {
      this.logger.error(`No successful fact sheet found for draft ${draftId}`, '', 'DraftGenerationProcessor');
      await this.db.draft.update({
        where: { id: draftId },
        data: { status: DraftStatus.GENERATION_FAILED },
      });
      return;
    }

    // Update draft status to GENERATING
    await this.db.draft.update({
      where: { id: draftId },
      data: { status: DraftStatus.GENERATING },
    });

    const brand = draft.brandProfile;
    const brandRules = {
      tone: brand.tone,
      audience: brand.audience,
      writingRules: brand.writingRulesJson as string[],
      forbiddenPhrases: brand.forbiddenPhrasesJson as string[],
      defaultHashtags: brand.defaultHashtagsJson as string[],
      headlineStyle: brand.headlineStyle,
      emojiPolicy: brand.emojiPolicy,
    };

    const replacements = {
      FACT_SHEET: JSON.stringify(factSheet.factsJson, null, 2),
      BRAND_RULES: JSON.stringify(brandRules, null, 2),
      CONTENT_TYPE: 'SUMMARY',
      LANGUAGE: brand.language,
    };

    const { user } = buildPrompt('DRAFT_GENERATION', 'v1', replacements);

    try {
      const context = {
        workspaceId,
        userId: userId || 'SYSTEM',
        correlationId,
        idempotencyKey: `draft-gen-${draft.id}-${Date.now()}`,
        timeoutMs: 60000,
      };

      // Call AI Provider
      const result = await this.ai.generateDraft(
        {
          factSheet: factSheet.factsJson as any,
          brandRules: brandRules as any,
          contentType: 'SUMMARY',
          language: brand.language as any,
        },
        context,
      );

      // Increment version number
      const existingVersionsCount = await this.db.draftVersion.count({
        where: { draftId },
      });
      const nextVersionNumber = existingVersionsCount + 1;

      // Save Draft Version
      const draftVersion = await this.db.draftVersion.create({
        data: {
          workspaceId,
          draftId,
          versionNumber: nextVersionNumber,
          headline: result.data.headline,
          hook: result.data.hook,
          body: result.data.body,
          whyItMatters: result.data.whyItMatters,
          discussionQuestion: result.data.discussionQuestion || null,
          hashtagsJson: result.data.hashtags as any,
          attributionLine: result.data.attributionLine || `Nguồn: ${brand.name}`,
          recommendedLink: result.data.recommendedLink || null,
          contentType: result.data.contentType as any,
          riskFlagsJson: result.data.riskFlags as any,
          verificationJson: {},
          similarityScore: 0.0,
          sourceClaimIdsJson: result.data.sourceClaimIds as any,
          createdByPlain: DraftCreatedByType.AI,
          createdByUserId: userId || 'SYSTEM',
          provider: result.provider,
          model: result.model,
          promptVersion: 'v1',
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          estimatedCostMinor: result.estimatedCostMinor,
          currency: result.currency,
        },
      });

      // Update Draft to reference new current version
      await this.db.draft.update({
        where: { id: draftId },
        data: {
          currentVersionId: draftVersion.id,
          status: DraftStatus.DRAFT, // reset status to DRAFT so user can edit or review
        },
      });

      // Record AI usage
      await this.db.aiUsageEvent.create({
        data: {
          workspaceId,
          userId: userId || 'SYSTEM',
          taskType: PromptTaskType.DRAFT_GENERATION,
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

      // Audit Log
      await this.db.auditLog.create({
        data: {
          workspaceId,
          actorId: userId || 'SYSTEM',
          actorType: userId ? 'USER' : 'SYSTEM',
          action: 'draft.generated',
          resource: 'draft',
          resourceId: draftId,
          afterValues: {
            version: nextVersionNumber,
            cost: result.estimatedCostMinor,
          },
          correlationId,
        },
      });

      // Enqueue Verification
      await this.verificationQueue.add(
        'verify',
        {
          draftId,
          versionId: draftVersion.id,
          workspaceId,
          correlationId,
          userId,
        },
        {
          jobId: `verify-${draftVersion.id}`,
        },
      );

      this.logger.log(`Successfully generated draft version ${nextVersionNumber} for draft ${draftId}`, 'DraftGenerationProcessor');
    } catch (err: any) {
      this.logger.error(`Error generating draft: ${err.message}`, err.stack, 'DraftGenerationProcessor');

      await this.db.draft.update({
        where: { id: draftId },
        data: { status: DraftStatus.GENERATION_FAILED },
      });

      await this.db.aiUsageEvent.create({
        data: {
          workspaceId,
          userId: userId || 'SYSTEM',
          taskType: PromptTaskType.DRAFT_GENERATION,
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
          action: 'draft.generation_failed',
          resource: 'draft',
          resourceId: draftId,
          afterValues: { error: err.message },
          correlationId,
        },
      });

      throw err;
    }
  }
}
