/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import {
  AiProvider,
  AiRequestContext,
  AiResult,
  FactSheet,
  GeneratedDraft,
  DraftVerificationResult,
  FactExtractionInput,
  DraftGenerationInput,
  DraftVerificationInput,
} from './ai-provider.interface';

export class MockAiProvider implements AiProvider {
  private async simulateDelay(context: AiRequestContext, inputKeywordSource?: string) {
    let delay = 100; // default 100ms
    if (inputKeywordSource && inputKeywordSource.includes('trigger_timeout')) {
      delay = context.timeoutMs + 500;
    }
    
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, delay);
      if (delay > context.timeoutMs) {
        setTimeout(() => {
          clearTimeout(timer);
          reject(new Error('AI_REQUEST_TIMEOUT'));
        }, context.timeoutMs);
      }
    });
  }

  async extractFacts(
    input: FactExtractionInput,
    context: AiRequestContext
  ): Promise<AiResult<FactSheet>> {
    const textUnion = input.sources.map((s) => s.title + ' ' + s.excerpt).join(' ');

    if (textUnion.includes('trigger_failure')) {
      throw new Error('AI_PROVIDER_UNAVAILABLE');
    }

    await this.simulateDelay(context, textUnion);

    // Build dynamic mock facts from source title & excerpt
    const articleIds = input.sources.map((s) => s.id);
    const mockClaims: Array<{
      claimId: string;
      text: string;
      sourceArticleId: string;
      evidenceExcerpt: string;
      confidence: number;
      status: 'CONFIRMED' | 'CONFLICTING' | 'UNCERTAIN';
    }> = input.sources.map((s, idx) => ({
      claimId: `claim-${s.id}-${idx + 1}`,
      text: s.title || 'Thông tin từ bài viết nguồn',
      sourceArticleId: s.id,
      evidenceExcerpt: s.excerpt ? s.excerpt.slice(0, 150) : s.title,
      confidence: 0.95,
      status: 'CONFIRMED',
    }));

    const data: FactSheet = {
      articleIds,
      sourceClaims: mockClaims,
      entities: input.sources.map((s) => ({
        type: 'ORGANIZATION',
        canonicalName: s.attributionName || 'Nguồn tin',
        aliases: [],
      })),
      dates: [],
      numbers: [],
      scores: [],
      quotes: [],
      conflicts: [],
      uncertaintyFlags: [],
    };

    return {
      data,
      provider: 'mock',
      model: 'mock-fact-extraction',
      inputTokens: 120,
      outputTokens: 250,
      estimatedCostMinor: 2,
      currency: 'USD',
      durationMs: 150,
    };
  }

  async generateDraft(
    input: DraftGenerationInput,
    context: AiRequestContext
  ): Promise<AiResult<GeneratedDraft>> {
    const claims = input.factSheet.sourceClaims;
    const firstClaimText = claims.length > 0 ? claims[0].text : 'Thông tin mới nhất';
    const firstClaimExcerpt = claims.length > 0 ? claims[0].evidenceExcerpt : firstClaimText;

    await this.simulateDelay(context, firstClaimText);

    if (firstClaimText.includes('trigger_failure')) {
      throw new Error('AI_PROVIDER_UNAVAILABLE');
    }

    const data: GeneratedDraft = {
      language: input.language || 'vi',
      headline: firstClaimText,
      hook: `${firstClaimText} - ${firstClaimExcerpt.slice(0, 100)}`,
      body: `Nội dung chi tiết được tổng hợp từ nguồn tin uy tín: "${firstClaimExcerpt}". Sự việc đang tiếp tục được các cơ quan và giới chuyên môn theo dõi sát sao.`,
      whyItMatters: 'Thông tin có ảnh hưởng lớn đến tình hình hiện tại.',
      discussionQuestion: 'Bạn nghĩ sao về diễn biến này?',
      hashtags: input.brandRules.defaultHashtags.length ? input.brandRules.defaultHashtags : ['TinTuc', 'HotNews'],
      attributionLine: 'Nguồn: Tổng hợp tin tức',
      recommendedLink: '',
      contentType: 'SUMMARY',
      sourceClaimIds: claims.map((c) => c.claimId),
      riskFlags: [],
      confidence: 0.9,
    };

    return {
      data,
      provider: 'mock',
      model: 'mock-draft-generation',
      inputTokens: 350,
      outputTokens: 420,
      estimatedCostMinor: 4,
      currency: 'USD',
      durationMs: 250,
    };
  }

  async verifyDraft(
    input: DraftVerificationInput,
    context: AiRequestContext
  ): Promise<AiResult<DraftVerificationResult>> {
    await this.simulateDelay(context, input.generatedDraft.headline);

    const data: DraftVerificationResult = {
      passed: true,
      blockingErrors: [],
      warnings: [],
      unsupportedClaims: [],
      changedEntities: [],
      changedDates: [],
      changedNumbers: [],
      changedScores: [],
      quoteIssues: [],
      similarityScore: 0,
      riskFlags: [],
    };

    return {
      data,
      provider: 'mock',
      model: 'mock-verification',
      inputTokens: 200,
      outputTokens: 100,
      estimatedCostMinor: 1,
      currency: 'USD',
      durationMs: 100,
    };
  }
}
