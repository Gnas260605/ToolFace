import { z } from 'zod';

// ============================================================================
// 1. Zod Schemas for Structural AI Validation
// ============================================================================

export const SourceClaimSchema = z.object({
  claimId: z.string().default(() => `claim-${Date.now()}`),
  text: z.string(),
  sourceArticleId: z.string().default(''),
  evidenceExcerpt: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0.9),
  status: z.enum(['CONFIRMED', 'CONFLICTING', 'UNCERTAIN']).default('CONFIRMED'),
});

export const EntitySchema = z.union([
  z.object({
    type: z.enum(['PERSON', 'TEAM', 'ORGANIZATION', 'LOCATION', 'COMPETITION', 'EVENT', 'GROUP', 'OTHER', 'CONCEPT', 'PRODUCT']).catch('ORGANIZATION'),
    canonicalName: z.string(),
    aliases: z.array(z.string()).default([]),
  }),
  z.string().transform((name) => ({
    type: 'ORGANIZATION' as const,
    canonicalName: name,
    aliases: [],
  })),
]);

export const DateFactSchema = z.union([
  z.object({
    value: z.union([z.string(), z.number().transform((n) => String(n))]),
    context: z.string().default(''),
    sourceArticleIds: z.array(z.string()).default([]),
    confidence: z.number().min(0).max(1).default(0.9),
  }),
  z.string().transform((val) => ({
    value: val,
    context: '',
    sourceArticleIds: [],
    confidence: 0.9,
  })),
]);

export const NumberFactSchema = z.union([
  z.object({
    value: z.union([z.string(), z.number().transform((n) => String(n))]),
    unit: z.string().optional(),
    context: z.string().default(''),
    sourceArticleIds: z.array(z.string()).default([]),
    confidence: z.number().min(0).max(1).default(0.9),
  }),
  z.union([z.string(), z.number()]).transform((val) => ({
    value: String(val),
    unit: undefined,
    context: '',
    sourceArticleIds: [],
    confidence: 0.9,
  })),
]);

export const ScoreFactSchema = z.union([
  z.object({
    homeTeam: z.string().optional(),
    awayTeam: z.string().optional(),
    homeScore: z.number().optional(),
    awayScore: z.number().optional(),
    rawText: z.string().default(''),
    sourceArticleIds: z.array(z.string()).default([]),
    confidence: z.number().min(0).max(1).default(0.9),
  }),
  z.string().transform((raw) => ({
    homeTeam: undefined,
    awayTeam: undefined,
    homeScore: undefined,
    awayScore: undefined,
    rawText: raw,
    sourceArticleIds: [],
    confidence: 0.9,
  })),
]);

export const QuoteFactSchema = z.union([
  z.object({
    text: z.string(),
    speaker: z.string().default('unknown'),
    sourceArticleId: z.string().default(''),
    evidenceExcerpt: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0.9),
  }),
  z.string().transform((text) => ({
    text,
    speaker: 'unknown',
    sourceArticleId: '',
    evidenceExcerpt: text,
    confidence: 0.9,
  })),
]);

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

export const ViralScoreItemSchema = z.object({
  id: z.string(),
  score: z.number().min(0).max(100),
  reason: z.string(),
  category: z.string().default('khác'),
});

export const ViralScoreResultSchema = z.array(ViralScoreItemSchema);
export type ViralScoreItem = z.infer<typeof ViralScoreItemSchema>;

export type ViralScoringInput = {
  articles: Array<{
    id: string;
    title: string;
    summary?: string | null;
    sourceName?: string | null;
    publishedAt?: string | Date | null;
  }>;
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

  scoreViralPotential?(
    input: ViralScoringInput,
    context: AiRequestContext
  ): Promise<AiResult<ViralScoreItem[]>>;
}
