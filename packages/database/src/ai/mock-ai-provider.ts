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

    // Build mock facts
    const articleIds = input.sources.map((s) => s.id);
    const mockClaims: Array<{
      claimId: string;
      text: string;
      sourceArticleId: string;
      evidenceExcerpt: string;
      confidence: number;
      status: 'CONFIRMED' | 'CONFLICTING' | 'UNCERTAIN';
    }> = input.sources.flatMap((s) => [
      {
        claimId: `claim-${s.id}-1`,
        text: `Đội tuyển giành chiến thắng trong trận đấu ngày hôm nay`,
        sourceArticleId: s.id,
        evidenceExcerpt: s.excerpt.slice(0, 100) || 'Thắng lợi thuyết phục',
        confidence: 0.95,
        status: 'CONFIRMED',
      },
    ]);

    // Handle conflicting fees if triggered
    if (textUnion.includes('conflicting_fees')) {
      mockClaims.push({
        claimId: `claim-conflict-fee`,
        text: `Mức phí chuyển nhượng thỏa thuận`,
        sourceArticleId: articleIds[0],
        evidenceExcerpt: `Phí chuyển nhượng 80 triệu Euro`,
        confidence: 0.8,
        status: 'CONFLICTING',
      });
    }

    const data: FactSheet = {
      articleIds,
      sourceClaims: mockClaims,
      entities: [
        {
          type: 'TEAM',
          canonicalName: 'Manchester United',
          aliases: ['MU', 'Man United'],
        },
        {
          type: 'PERSON',
          canonicalName: 'Bruno Fernandes',
          aliases: ['Bruno'],
        },
      ],
      dates: [
        {
          value: '2026-07-12',
          context: 'Ngày thi đấu',
          sourceArticleIds: articleIds,
          confidence: 0.99,
        },
      ],
      numbers: [
        {
          value: '80',
          unit: 'triệu Euro',
          context: 'Phí chuyển nhượng',
          sourceArticleIds: articleIds,
          confidence: 0.9,
        },
      ],
      scores: [
        {
          homeTeam: 'Arsenal',
          awayTeam: 'Manchester United',
          homeScore: 1,
          awayScore: 2,
          rawText: 'Arsenal 1-2 MU',
          sourceArticleIds: articleIds,
          confidence: 0.95,
        },
      ],
      quotes: [
        {
          text: 'Chúng tôi đã chơi rất quả cảm.',
          speaker: 'Bruno Fernandes',
          sourceArticleId: articleIds[0],
          evidenceExcerpt: ' Bruno phát biểu: "Chúng tôi đã chơi rất quả cảm"',
          confidence: 0.95,
        },
      ],
      conflicts: textUnion.includes('conflicting_fees')
        ? [
            {
              field: 'transferFee',
              values: [
                { value: '80 triệu Euro', sourceArticleId: articleIds[0] },
                { value: '90 triệu Euro', sourceArticleId: articleIds[1] || articleIds[0] },
              ],
            },
          ]
        : [],
      uncertaintyFlags: textUnion.includes('unverified_rumor') ? ['Chưa chính thức xác nhận'] : [],
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
    const serialized = JSON.stringify(input);

    if (serialized.includes('trigger_failure')) {
      throw new Error('AI_PROVIDER_UNAVAILABLE');
    }

    await this.simulateDelay(context, serialized);

    if (serialized.includes('trigger_malformed')) {
      // Simulate invalid schema check
      throw new Error('AI_SCHEMA_VALIDATION_FAILED');
    }

    const homeScoreVal = serialized.includes('trigger_score_mismatch') ? 9 : 1;
    const quoteText = serialized.includes('trigger_fabricated_quote')
      ? 'Chúng tôi đã ăn mừng bằng cách uống rượu cả đêm.' // Fabricated quote
      : 'Chúng tôi đã chơi rất quả cảm.';

    const data: GeneratedDraft = {
      language: input.language,
      headline: 'Chiến thắng kịch tính Arsenal 1-2 MU',
      hook: 'Bruno Fernandes tỏa sáng mang về 3 điểm quý giá!',
      body: `Trận đấu tâm điểm kết thúc với tỉ số ${homeScoreVal}-2 nghiêng về Quỷ đỏ. Bruno Fernandes chia sẻ sau trận đấu: "${quoteText}". Đây là bước đệm lớn cho mùa giải mới.`,
      whyItMatters: 'MU thu hẹp khoảng cách điểm số với top 4.',
      discussionQuestion: 'Bạn nghĩ sao về màn trình diễn này?',
      hashtags: input.brandRules.defaultHashtags.length ? input.brandRules.defaultHashtags : ['MU', 'Arsenal'],
      attributionLine: 'Nguồn: Bóng Đá VN',
      recommendedLink: 'https://bongda24h.vn/mu-hom-nay',
      contentType: 'SUMMARY',
      sourceClaimIds: input.factSheet.sourceClaims.map((c) => c.claimId),
      riskFlags: input.factSheet.uncertaintyFlags.length ? ['UNVERIFIED_RUMOR'] : [],
      confidence: 0.95,
    };

    return {
      data,
      provider: 'mock',
      model: 'mock-draft-generation',
      inputTokens: 350,
      outputTokens: 420,
      estimatedCostMinor: 4,
      currency: 'USD',
      durationMs: 200,
    };
  }

  async verifyDraft(
    input: DraftVerificationInput,
    context: AiRequestContext
  ): Promise<AiResult<DraftVerificationResult>> {
    const serialized = JSON.stringify(input);
    await this.simulateDelay(context, serialized);

    const hasScoreMismatch = serialized.includes('9-2');
    const hasFabricatedQuote = serialized.includes('uống rượu cả đêm');

    const blockingErrors = [];
    if (hasScoreMismatch) {
      blockingErrors.push({
        code: 'SCORE_MISMATCH',
        message: 'Tỉ số trận đấu không khớp với dữ kiện nguồn (Arsenal 1-2 MU vs 9-2)',
        field: 'body',
        evidence: '9-2',
      });
    }
    if (hasFabricatedQuote) {
      blockingErrors.push({
        code: 'FABRICATED_QUOTE',
        message: 'Trích dẫn phát biểu bịa đặt, không tìm thấy trong nguồn gốc.',
        field: 'body',
        evidence: 'uống rượu cả đêm',
      });
    }

    const data: DraftVerificationResult = {
      passed: blockingErrors.length === 0,
      blockingErrors,
      warnings: [],
      unsupportedClaims: [],
      changedEntities: [],
      changedDates: [],
      changedNumbers: [],
      changedScores: hasScoreMismatch ? ['9-2'] : [],
      quoteIssues: hasFabricatedQuote ? ['uống rượu cả đêm'] : [],
      similarityScore: 0.25,
      riskFlags: [],
    };

    return {
      data,
      provider: 'mock',
      model: 'mock-draft-verification',
      inputTokens: 280,
      outputTokens: 110,
      estimatedCostMinor: 1,
      currency: 'USD',
      durationMs: 120,
    };
  }
}
