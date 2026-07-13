/* eslint-disable @typescript-eslint/no-explicit-any */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { JsonLogger } from '../common/logger.service';
import {
  AiProvider,
  DeterministicVerifier,
  PromptTaskType,
  FactSheetStatus,
  calculateHash,
} from '@newsflow/database';

@Processor('draft-verification')
@Injectable()
export class DraftVerificationProcessor extends WorkerHost {
  private verifier: DeterministicVerifier;

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(JsonLogger) private readonly logger: JsonLogger,
    @Inject('AiProvider') private readonly ai: AiProvider,
  ) {
    super();
    this.verifier = new DeterministicVerifier();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { draftId, versionId, workspaceId, correlationId, userId } = job.data;
    this.logger.log(`Processing draft verification job for draft ${draftId} version ${versionId}`, 'DraftVerificationProcessor');

    // 1. Fetch Draft and exact Version
    const draft = await this.db.draft.findFirst({
      where: { id: draftId, workspaceId },
      include: { brandProfile: true },
    });

    const draftVersion = await this.db.draftVersion.findFirst({
      where: { id: versionId, draftId },
    });

    if (!draft || !draftVersion) {
      this.logger.error(`Draft or Version not found`, '', 'DraftVerificationProcessor');
      return;
    }

    // 2. Fetch Workspace Policy
    let policy = await this.db.editorialPolicy.findUnique({
      where: { workspaceId },
    });
    if (!policy) {
      policy = await this.db.editorialPolicy.create({
        data: {
          workspaceId,
          maximumSimilarityScore: 0.75,
          maximumQuoteWords: 25,
          requireSeparateReviewer: false,
          allowAiVerification: true,
          blockHighRiskSubmission: true,
        },
      });
    }

    // 3. Find underlying Fact Sheet
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
      this.logger.error(`No fact sheet found for draft verification`, '', 'DraftVerificationProcessor');
      return;
    }

    // 4. Fetch source articles for similarity check
    const articles = [];
    if (draft.primaryArticleId) {
      const art = await this.db.article.findFirst({
        where: { id: draft.primaryArticleId, workspaceId },
      });
      if (art) articles.push(art);
    } else if (draft.clusterId) {
      const clusterArticles = await this.db.storyClusterArticle.findMany({
        where: { clusterId: draft.clusterId },
        include: { article: true },
      });
      for (const ca of clusterArticles) {
        if (ca.article) articles.push(ca.article);
      }
    }

    const sourceTexts = articles.map((a) => a.contentExcerpt || a.summary || a.title);

    const generatedDraftInput = {
      language: draft.brandProfile.language as any,
      headline: draftVersion.headline,
      hook: draftVersion.hook,
      body: draftVersion.body,
      whyItMatters: draftVersion.whyItMatters,
      discussionQuestion: draftVersion.discussionQuestion || undefined,
      hashtags: draftVersion.hashtagsJson as string[],
      attributionLine: draftVersion.attributionLine,
      recommendedLink: draftVersion.recommendedLink || undefined,
      contentType: draftVersion.contentType as any,
      sourceClaimIds: draftVersion.sourceClaimIdsJson as string[],
      riskFlags: draftVersion.riskFlagsJson as string[],
      confidence: 1.0,
    };

    const detResult = this.verifier.verify({
      factSheet: factSheet.factsJson as any,
      generatedDraft: generatedDraftInput,
      sourceTexts,
      editorialPolicy: {
        maximumSimilarityScore: policy.maximumSimilarityScore,
        maximumQuoteWords: policy.maximumQuoteWords,
        blockHighRiskSubmission: policy.blockHighRiskSubmission,
      },
      brandProfile: {
        forbiddenPhrasesJson: draft.brandProfile.forbiddenPhrasesJson,
      },
    });

    let finalResult = { ...detResult };

    // 6. Optional Secondary AI Verification
    if (policy.allowAiVerification) {
      try {
        const context = {
          workspaceId,
          userId: userId || 'SYSTEM',
          correlationId,
          idempotencyKey: `verify-${draftVersion.id}`,
          timeoutMs: 60000,
        };

        const aiVerify = await this.ai.verifyDraft(
          {
            factSheet: factSheet.factsJson as any,
            generatedDraft: generatedDraftInput,
          },
          context,
        );

        // Combine AI findings with local checks
        const aiData = aiVerify.data;
        const combinedBlocking = [...detResult.blockingErrors];
        const combinedWarnings = [...detResult.warnings];

        // AI verifier cannot override deterministic blockings
        for (const err of aiData.blockingErrors) {
          if (!combinedBlocking.some((e) => e.code === err.code || e.evidence === err.evidence)) {
            combinedBlocking.push({
              code: err.code || 'AI_BLOCKING_ERROR',
              message: err.message,
              field: err.field,
              evidence: err.evidence,
            });
          }
        }

        for (const warn of aiData.warnings) {
          if (!combinedWarnings.some((w) => w.code === warn.code)) {
            combinedWarnings.push({
              code: warn.code || 'AI_WARNING',
              message: warn.message,
              field: warn.field,
            });
          }
        }

        finalResult = {
          passed: combinedBlocking.length === 0,
          blockingErrors: combinedBlocking,
          warnings: combinedWarnings,
          unsupportedClaims: Array.from(new Set([...detResult.unsupportedClaims, ...aiData.unsupportedClaims])),
          changedEntities: aiData.changedEntities || [],
          changedDates: aiData.changedDates || [],
          changedNumbers: aiData.changedNumbers || [],
          changedScores: Array.from(new Set([...detResult.changedScores, ...(aiData.changedScores || [])])),
          quoteIssues: Array.from(new Set([...detResult.quoteIssues, ...(aiData.quoteIssues || [])])),
          similarityScore: detResult.similarityScore,
          riskFlags: Array.from(new Set([...detResult.riskFlags, ...(aiData.riskFlags || [])])),
        };

        // Record AI usage
        await this.db.aiUsageEvent.create({
          data: {
            workspaceId,
            userId: userId || 'SYSTEM',
            taskType: PromptTaskType.DRAFT_VERIFICATION,
            provider: aiVerify.provider,
            model: aiVerify.model,
            inputTokens: aiVerify.inputTokens,
            outputTokens: aiVerify.outputTokens,
            estimatedCostMinor: aiVerify.estimatedCostMinor,
            requestHash: calculateHash(JSON.stringify(generatedDraftInput)),
            status: 'SUCCESS',
            durationMs: aiVerify.durationMs,
            occurredAt: new Date(),
          },
        });
      } catch (err: any) {
        this.logger.error(`Secondary AI verification failed: ${err.message}`, err.stack, 'DraftVerificationProcessor');
        // Do not fail the job, fallback safely to deterministic verification result
      }
    }

    // 7. Update Draft Version with results
    await this.db.draftVersion.update({
      where: { id: versionId },
      data: {
        verificationJson: finalResult as any,
        similarityScore: finalResult.similarityScore,
      },
    });

    // Audit completed verification
    await this.db.auditLog.create({
      data: {
        workspaceId,
        actorId: userId || 'SYSTEM',
        actorType: userId ? 'USER' : 'SYSTEM',
        action: 'draft.verification_completed',
        resource: 'draft_version',
        resourceId: versionId,
        afterValues: { passed: finalResult.passed, similarity: finalResult.similarityScore },
        correlationId,
      },
    });

    this.logger.log(`Completed verification for draft ${draftId} version ${versionId}. Passed: ${finalResult.passed}`, 'DraftVerificationProcessor');
  }
}
