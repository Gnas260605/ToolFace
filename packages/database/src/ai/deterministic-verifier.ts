/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  FactSheet,
  GeneratedDraft,
  DraftVerificationResult,
} from './ai-provider.interface';

export class DeterministicVerifier {
  verify(input: {
    factSheet: FactSheet;
    generatedDraft: GeneratedDraft;
    sourceTexts: string[];
    editorialPolicy: {
      maximumSimilarityScore: number;
      maximumQuoteWords: number;
      blockHighRiskSubmission: boolean;
    };
    brandProfile: {
      forbiddenPhrasesJson: string[] | any;
    };
  }): DraftVerificationResult {
    const { factSheet, generatedDraft, sourceTexts, editorialPolicy, brandProfile } = input;
    const draftText = (generatedDraft.headline + ' ' + generatedDraft.hook + ' ' + generatedDraft.body).toLowerCase();

    const blockingErrors: Array<{ code: string; message: string; field?: string; evidence?: string }> = [];
    const warnings: Array<{ code: string; message: string; field?: string }> = [];
    const unsupportedClaims: string[] = [];
    const quoteIssues: string[] = [];
    const changedScores: string[] = [];

    // ============================================================================
    // 1. Score verification
    // ============================================================================
    const scoreRegex = /(\d+)\s*-\s*(\d+)/g;
    let match;
    const draftScores: string[] = [];
    while ((match = scoreRegex.exec(draftText)) !== null) {
      draftScores.push(match[0]);
      const s1 = parseInt(match[1], 10);
      const s2 = parseInt(match[2], 10);

      // Check if this score is present in the fact sheet
      const matchedFactScore = factSheet.scores.find(
        (fs) =>
          (fs.homeScore === s1 && fs.awayScore === s2) ||
          (fs.homeScore === s2 && fs.awayScore === s1) ||
          fs.rawText.includes(`${s1}-${s2}`) ||
          fs.rawText.includes(`${s2}-${s1}`)
      );

      if (!matchedFactScore) {
        changedScores.push(match[0]);
        blockingErrors.push({
          code: 'SCORE_MISMATCH',
          message: `Tỉ số ${match[0]} xuất hiện trong bản nháp nhưng không khớp với dữ kiện nguồn.`,
          field: 'body',
          evidence: match[0],
        });
      }
    }

    // ============================================================================
    // 2. Quote verification
    // ============================================================================
    const quoteRegex = /"([^"]+)"|'([^']+)'/g;
    let quoteMatch;
    while ((quoteMatch = quoteRegex.exec(generatedDraft.body)) !== null) {
      const draftQuote = quoteMatch[1] || quoteMatch[2];
      if (!draftQuote || draftQuote.trim().split(/\s+/).length < 3) continue;

      const normDraftQuote = draftQuote.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’]/g, '').trim();

      // Find similar quote in fact sheet
      const foundQuote = factSheet.quotes.find((q) => {
        const normFactQuote = q.text.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’]/g, '').trim();
        return normFactQuote.includes(normDraftQuote) || normDraftQuote.includes(normFactQuote);
      });

      if (!foundQuote) {
        quoteIssues.push(draftQuote);
        blockingErrors.push({
          code: 'FABRICATED_QUOTE',
          message: `Trích dẫn phát biểu "${draftQuote}" không tồn tại trong dữ kiện nguồn.`,
          field: 'body',
          evidence: draftQuote,
        });
      } else {
        const quoteWordCount = draftQuote.split(/\s+/).length;
        if (quoteWordCount > (editorialPolicy.maximumQuoteWords || 25)) {
          warnings.push({
            code: 'QUOTE_TOO_LONG',
            message: `Trích dẫn dài quá giới hạn ${editorialPolicy.maximumQuoteWords || 25} từ.`,
            field: 'body',
          });
        }
      }
    }

    // ============================================================================
    // 3. Forbidden phrases check
    // ============================================================================
    const forbiddenPhrases = Array.isArray(brandProfile.forbiddenPhrasesJson)
      ? brandProfile.forbiddenPhrasesJson
      : [];

    for (const phrase of forbiddenPhrases) {
      if (phrase && draftText.includes(phrase.toLowerCase())) {
        blockingErrors.push({
          code: 'FORBIDDEN_PHRASE',
          message: `Bản nháp chứa từ ngữ bị cấm: "${phrase}".`,
          field: 'body',
          evidence: phrase,
        });
      }
    }

    // ============================================================================
    // 4. Similarity and Copying Checks (3-gram Jaccard Overlap)
    // ============================================================================
    let maxSimilarity = 0;
    for (const srcText of sourceTexts) {
      if (!srcText) continue;
      const sim = this.calculateNGramSimilarity(generatedDraft.body, srcText, 3);
      if (sim > maxSimilarity) {
        maxSimilarity = sim;
      }
    }

    if (maxSimilarity > editorialPolicy.maximumSimilarityScore) {
      blockingErrors.push({
        code: 'SIMILARITY_TOO_HIGH',
        message: `Độ tương đồng với văn bản nguồn (${(maxSimilarity * 100).toFixed(0)}%) vượt quá mức cho phép (${(editorialPolicy.maximumSimilarityScore * 100).toFixed(0)}%).`,
        field: 'body',
        evidence: `${(maxSimilarity * 100).toFixed(0)}%`,
      });
    } else if (maxSimilarity > 0.55) {
      warnings.push({
        code: 'SIMILARITY_WARNING',
        message: `Độ tương đồng tương đối cao (${(maxSimilarity * 100).toFixed(0)}%). Cân nhắc sửa lại văn bản để tăng tính độc quyền.`,
        field: 'body',
      });
    }

    // ============================================================================
    // 5. Attribution requirement checks
    // ============================================================================
    if (!generatedDraft.attributionLine || generatedDraft.attributionLine.trim().length === 0) {
      blockingErrors.push({
        code: 'ATTRIBUTION_REQUIRED',
        message: 'Bản nháp bắt buộc phải có dòng ghi nhận nguồn (Attribution line).',
        field: 'attributionLine',
      });
    }

    return {
      passed: blockingErrors.length === 0,
      blockingErrors,
      warnings,
      unsupportedClaims,
      changedEntities: [],
      changedDates: [],
      changedNumbers: [],
      changedScores,
      quoteIssues,
      similarityScore: maxSimilarity,
      riskFlags: generatedDraft.riskFlags,
    };
  }

  private calculateNGramSimilarity(textA: string, textB: string, n = 3): number {
    const getNGrams = (str: string) => {
      const tokens = str
        .toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’]/g, '')
        .split(/\s+/)
        .filter(Boolean);
      const ngrams = new Set<string>();
      for (let i = 0; i <= tokens.length - n; i++) {
        ngrams.add(tokens.slice(i, i + n).join(' '));
      }
      return ngrams;
    };

    const ngramsA = getNGrams(textA);
    const ngramsB = getNGrams(textB);

    if (ngramsA.size === 0 || ngramsB.size === 0) return 0;

    let intersection = 0;
    for (const gram of ngramsA) {
      if (ngramsB.has(gram)) {
        intersection++;
      }
    }

    return intersection / Math.min(ngramsA.size, ngramsB.size);
  }
}
