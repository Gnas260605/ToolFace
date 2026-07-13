import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuotaManager, PrismaClient } from '@newsflow/database';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------
const makePolicy = (overrides = {}) => ({
  workspaceId: 'ws-1',
  monthlyAiBudgetMinor: 2000, // $20.00
  monthlyAiGenerationLimit: 200,
  ...overrides,
});

const makeEvent = (overrides = {}) => ({
  id: 'evt-1',
  workspaceId: 'ws-1',
  taskType: 'DRAFT_GENERATION',
  estimatedCostMinor: 10,
  inputTokens: 500,
  outputTokens: 300,
  status: 'SUCCESS',
  occurredAt: new Date(),
  ...overrides,
});

function buildMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    editorialPolicy: {
      findUnique: vi.fn().mockResolvedValue(makePolicy()),
      create: vi.fn().mockResolvedValue(makePolicy()),
    },
    aiUsageEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    ...overrides,
  };
}

describe('QuotaManager — Unit Tests', () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let qm: QuotaManager;

  beforeEach(() => {
    prisma = buildMockPrisma();
    qm = new QuotaManager(prisma as unknown as PrismaClient);
  });

  // ── checkQuota ──────────────────────────────────────────────────────────

  it('should allow when no usage events exist', async () => {
    const result = await qm.checkQuota('ws-1');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should deny when monthly budget is exceeded', async () => {
    prisma.aiUsageEvent.findMany.mockResolvedValue([
      makeEvent({ estimatedCostMinor: 2001, taskType: 'DRAFT_GENERATION' }),
    ]);

    const result = await qm.checkQuota('ws-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('AI_BUDGET_EXCEEDED');
  });

  it('should deny when generation count limit is reached', async () => {
    const events = Array.from({ length: 200 }, () =>
      makeEvent({ estimatedCostMinor: 1 }),
    );
    prisma.aiUsageEvent.findMany.mockResolvedValue(events);

    const result = await qm.checkQuota('ws-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('AI_QUOTA_EXCEEDED');
  });

  it('should create a default policy if none exists', async () => {
    prisma.editorialPolicy.findUnique.mockResolvedValue(null);

    await qm.checkQuota('ws-1');
    expect(prisma.editorialPolicy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'ws-1',
        monthlyAiBudgetMinor: 2000,
        monthlyAiGenerationLimit: 200,
      }),
    });
  });

  it('should only count SUCCESS events toward the budget', async () => {
    prisma.aiUsageEvent.findMany.mockResolvedValue([
      makeEvent({ estimatedCostMinor: 1500, status: 'FAILED' }),
    ]);

    const result = await qm.checkQuota('ws-1');
    // FAILED events should not count
    expect(result.allowed).toBe(true);
  });

  // ── getUsageSummary ─────────────────────────────────────────────────────

  it('should return zero-usage summary when no events', async () => {
    const summary = await qm.getUsageSummary('ws-1');

    expect(summary.draftGenerations).toBe(0);
    expect(summary.factExtractions).toBe(0);
    expect(summary.estimatedCostMinor).toBe(0);
    expect(summary.currency).toBe('USD');
    expect(summary.generationLimit).toBe(200);
    expect(summary.remainingGenerations).toBe(200);
  });

  it('should correctly aggregate token usage across events', async () => {
    prisma.aiUsageEvent.findMany.mockResolvedValue([
      makeEvent({ inputTokens: 100, outputTokens: 50, estimatedCostMinor: 5, taskType: 'FACT_EXTRACTION', status: 'SUCCESS' }),
      makeEvent({ inputTokens: 200, outputTokens: 100, estimatedCostMinor: 10, taskType: 'DRAFT_GENERATION', status: 'SUCCESS' }),
    ]);

    const summary = await qm.getUsageSummary('ws-1');

    expect(summary.inputTokens).toBe(300);
    expect(summary.outputTokens).toBe(150);
    expect(summary.estimatedCostMinor).toBe(15);
    expect(summary.factExtractions).toBe(1);
    expect(summary.draftGenerations).toBe(1);
    expect(summary.remainingGenerations).toBe(199);
  });

  it('should return period in YYYY-MM format', async () => {
    const summary = await qm.getUsageSummary('ws-1');
    expect(summary.period).toMatch(/^\d{4}-\d{2}$/);
  });
});
