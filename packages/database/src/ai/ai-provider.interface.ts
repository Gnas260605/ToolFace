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
  articleIds: z.array(z.string()),
  sourceClaims: z.array(SourceClaimSchema),
  entities: z.array(EntitySchema),
  dates: z.array(DateFactSchema),
  numbers: z.array(NumberFactSchema),
  scores: z.array(ScoreFactSchema),
  quotes: z.array(QuoteFactSchema),
  conflicts: z.array(ConflictSchema),
  uncertaintyFlags: z.array(z.string()),
});

export type FactSheet = z.infer<typeof FactSheetSchema>;

export const GeneratedDraftSchema = z.object({
  language: z.enum(['vi', 'en']),
  headline: z.string(),
  hook: z.string(),
  body: z.string(),
  whyItMatters: z.string(),
  discussionQuestion: z.string().optional(),
  hashtags: z.array(z.string()),
  attributionLine: z.string(),
  recommendedLink: z.string().optional(),
  contentType: z.enum([
    'BREAKING',
    'SUMMARY',
    'ANALYSIS',
    'RESULT',
    'RUMOR',
    'TRANSFER',
    'MATCH_PREVIEW',
    'MATCH_RECAP',
  ]),
  sourceClaimIds: z.array(z.string()),
  riskFlags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type GeneratedDraft = z.infer<typeof GeneratedDraftSchema>;

export const DraftVerificationResultSchema = z.object({
  passed: z.boolean(),
  blockingErrors: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      field: z.string().optional(),
      evidence: z.string().optional(),
    })
  ),
  warnings: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      field: z.string().optional(),
    })
  ),
  unsupportedClaims: z.array(z.string()),
  changedEntities: z.array(
    z.object({
      expected: z.string(),
      actual: z.string(),
    })
  ),
  changedDates: z.array(z.string()),
  changedNumbers: z.array(z.string()),
  changedScores: z.array(z.string()),
  quoteIssues: z.array(z.string()),
  similarityScore: z.number().min(0).max(1),
  riskFlags: z.array(z.string()),
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
