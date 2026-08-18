import { z } from 'zod';

// ============================================================================
// 1. Zod Schemas for Structural AI Validation
// ============================================================================

export const SourceClaimSchema = z.object({
  claimId: z.string(),
  text: z.string(),
  sourceArticleId: z.string(),
  evidenceExcerpt: z.string(),
  confidence: z.number().min(0).max(1),
  status: z.enum(['CONFIRMED', 'CONFLICTING', 'UNCERTAIN']),
});

export const EntitySchema = z.object({
  type: z.enum(['PERSON', 'TEAM', 'ORGANIZATION', 'LOCATION', 'COMPETITION', 'EVENT']),
  canonicalName: z.string(),
  aliases: z.array(z.string()),
});

export const DateFactSchema = z.object({
  value: z.string(),
  context: z.string(),
  sourceArticleIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export const NumberFactSchema = z.object({
  value: z.string(),
  unit: z.string().optional(),
  context: z.string(),
  sourceArticleIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export const ScoreFactSchema = z.object({
  homeTeam: z.string().optional(),
  awayTeam: z.string().optional(),
  homeScore: z.number().optional(),
  awayScore: z.number().optional(),
  rawText: z.string(),
  sourceArticleIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export const QuoteFactSchema = z.object({
  text: z.string(),
  speaker: z.string(),
  sourceArticleId: z.string(),
  evidenceExcerpt: z.string(),
  confidence: z.number().min(0).max(1),
});

export const ConflictSchema = z.object({
  field: z.string(),
  values: z.array(
    z.object({
      value: z.string(),
      sourceArticleId: z.string(),
    })
  ),
});

export const FactSheetSchema = z.object({
  articleIds: z.array(z.string()).optional().default([]),
  sourceClaims: z.array(SourceClaimSchema).optional().default([]),
  entities: z.array(EntitySchema).optional().default([]),
  dates: z.array(DateFactSchema).optional().default([]),
  numbers: z.array(NumberFactSchema).optional().default([]),
  scores: z.array(ScoreFactSchema).optional().default([]),
  quotes: z.array(QuoteFactSchema).optional().default([]),
  conflicts: z.array(ConflictSchema).optional().default([]),
  uncertaintyFlags: z.array(z.string()).optional().default([]),
});

export type FactSheet = z.infer<typeof FactSheetSchema>;

export const GeneratedDraftSchema = z.object({
  language: z.preprocess((val) => {
    if (typeof val === 'string' && val.toLowerCase().startsWith('en')) return 'en';
    return 'vi';
  }, z.enum(['vi', 'en'])).optional().default('vi'),
  headline: z.string(),
  hook: z.string(),
  body: z.string(),
  whyItMatters: z.string().optional().default(''),
  discussionQuestion: z.string().optional().default(''),
  hashtags: z.array(z.string()).optional().default([]),
  attributionLine: z.string().optional().default(''),
  recommendedLink: z.string().optional().default(''),
  contentType: z.preprocess((val) => {
    if (typeof val === 'string') {
      const upper = val.toUpperCase();
      if (['BREAKING', 'SUMMARY', 'ANALYSIS', 'RESULT', 'RUMOR', 'TRANSFER', 'MATCH_PREVIEW', 'MATCH_RECAP'].includes(upper)) {
        return upper;
      }
    }
    return 'SUMMARY';
  }, z.enum(['BREAKING', 'SUMMARY', 'ANALYSIS', 'RESULT', 'RUMOR', 'TRANSFER', 'MATCH_PREVIEW', 'MATCH_RECAP'])).optional().default('SUMMARY'),
  sourceClaimIds: z.array(z.string()).optional().default([]),
  riskFlags: z.array(z.string()).optional().default([]),
  confidence: z.preprocess((val) => {
    if (typeof val === 'number') return Math.min(1, Math.max(0, val));
    if (typeof val === 'string') {
      const parsed = parseFloat(val);
      if (!isNaN(parsed)) return Math.min(1, Math.max(0, parsed));
      if (val.toLowerCase() === 'high') return 0.9;
      if (val.toLowerCase() === 'medium') return 0.7;
      if (val.toLowerCase() === 'low') return 0.5;
    }
    return 0.9;
  }, z.number()).optional().default(0.9),
});

export type GeneratedDraft = z.infer<typeof GeneratedDraftSchema>;

export const DraftVerificationResultSchema = z.object({
  passed: z.boolean().optional().default(true),
  blockingErrors: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      field: z.string().optional(),
      evidence: z.string().optional(),
    })
  ).optional().default([]),
  warnings: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      field: z.string().optional(),
    })
  ).optional().default([]),
  unsupportedClaims: z.array(z.string()).optional().default([]),
  changedEntities: z.array(
    z.object({
      expected: z.string(),
      actual: z.string(),
    })
  ).optional().default([]),
  changedDates: z.array(z.string()).optional().default([]),
  changedNumbers: z.array(z.string()).optional().default([]),
  changedScores: z.array(z.string()).optional().default([]),
  quoteIssues: z.array(z.string()).optional().default([]),
  similarityScore: z.number().min(0).max(1).optional().default(0),
  riskFlags: z.array(z.string()).optional().default([]),
});

export type DraftVerificationResult = z.infer<typeof DraftVerificationResultSchema>;

// ============================================================================
// 2. AI Request Context and AI Result wrappers
// ============================================================================

export type AiRequestContext = {
  workspaceId: string;
  userId?: string;
  correlationId: string;
  idempotencyKey: string;
  timeoutMs: number;
};

export type AiResult<T> = {
  data: T;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostMinor: number;
  currency: string;
  durationMs: number;
};

// ============================================================================
// 3. Inputs for AI Provider Methods
// ============================================================================

export type FactExtractionInput = {
  sources: Array<{
    id: string;
    attributionName: string;
    title: string;
    excerpt: string;
  }>;
};

export type DraftGenerationInput = {
  factSheet: FactSheet;
  brandRules: {
    tone: string;
    audience: string;
    writingRules: string[];
    forbiddenPhrases: string[];
    defaultHashtags: string[];
    headlineStyle: string;
    emojiPolicy: 'NONE' | 'LOW' | 'MODERATE';
  };
  contentType: string;
  language: 'vi' | 'en';
};

export type DraftVerificationInput = {
  factSheet: FactSheet;
  generatedDraft: GeneratedDraft;
};

// ============================================================================
// 4. AiProvider Interface
// ============================================================================

export interface AiProvider {
  extractFacts(
    input: FactExtractionInput,
    context: AiRequestContext
  ): Promise<AiResult<FactSheet>>;

  generateDraft(
    input: DraftGenerationInput,
    context: AiRequestContext
  ): Promise<AiResult<GeneratedDraft>>;

  verifyDraft(
    input: DraftVerificationInput,
    context: AiRequestContext
  ): Promise<AiResult<DraftVerificationResult>>;
}
