/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from '@prisma/client';

export class QuotaManager {
  constructor(private readonly prisma: PrismaClient) {}

  async checkQuota(workspaceId: string): Promise<{ allowed: boolean; reason?: string }> {
    // 1. Fetch policy
    let policy = await this.prisma.editorialPolicy.findUnique({
      where: { workspaceId },
    });

    // Create a default policy if it doesn't exist to ensure fallback safety
    if (!policy) {
      policy = await this.prisma.editorialPolicy.create({
        data: {
          workspaceId,
          monthlyAiBudgetMinor: 2000, // $20.00
          monthlyAiGenerationLimit: 200,
        },
      });
    }

    // 2. Fetch current month usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const usageEvents = await this.prisma.aiUsageEvent.findMany({
      where: {
        workspaceId,
        occurredAt: { gte: startOfMonth },
        status: 'SUCCESS',
      },
    });

    const totalCost = usageEvents.reduce((sum, e) => sum + e.estimatedCostMinor, 0);
    const totalGenerations = usageEvents.filter((e) => e.taskType === 'DRAFT_GENERATION').length;

    if (totalCost >= policy.monthlyAiBudgetMinor) {
      return { allowed: false, reason: 'AI_BUDGET_EXCEEDED' };
    }

    if (totalGenerations >= policy.monthlyAiGenerationLimit) {
      return { allowed: false, reason: 'AI_QUOTA_EXCEEDED' };
    }

    return { allowed: true };
  }

  async getUsageSummary(workspaceId: string) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    let policy = await this.prisma.editorialPolicy.findUnique({
      where: { workspaceId },
    });

    if (!policy) {
      policy = {
        monthlyAiBudgetMinor: 2000,
        monthlyAiGenerationLimit: 200,
      } as any;
    }

    const usageEvents = await this.prisma.aiUsageEvent.findMany({
      where: {
        workspaceId,
        occurredAt: { gte: startOfMonth },
      },
      orderBy: { occurredAt: 'desc' },
    });

    const totalCost = usageEvents.reduce((sum, e) => sum + e.estimatedCostMinor, 0);
    const inputTokens = usageEvents.reduce((sum, e) => sum + e.inputTokens, 0);
    const outputTokens = usageEvents.reduce((sum, e) => sum + e.outputTokens, 0);
    const totalTokens = inputTokens + outputTokens;

    const factExtractions = usageEvents.filter((e) => e.taskType === 'FACT_EXTRACTION').length;
    const draftGenerations = usageEvents.filter((e) => e.taskType === 'DRAFT_GENERATION').length;
    const verifications = usageEvents.filter((e) => e.taskType === 'DRAFT_VERIFICATION').length;

    // Aggregate by model
    const byModelMap: Record<string, { count: number; inputTokens: number; outputTokens: number; costMinor: number }> = {};
    for (const ev of usageEvents) {
      const key = `${ev.provider}:${ev.model}`;
      if (!byModelMap[key]) {
        byModelMap[key] = { count: 0, inputTokens: 0, outputTokens: 0, costMinor: 0 };
      }
      byModelMap[key].count += 1;
      byModelMap[key].inputTokens += ev.inputTokens;
      byModelMap[key].outputTokens += ev.outputTokens;
      byModelMap[key].costMinor += ev.estimatedCostMinor;
    }

    const recentEvents = usageEvents.slice(0, 25).map((e) => ({
      id: e.id,
      taskType: e.taskType,
      provider: e.provider,
      model: e.model,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      totalTokens: e.inputTokens + e.outputTokens,
      estimatedCostMinor: e.estimatedCostMinor,
      status: e.status,
      durationMs: e.durationMs,
      occurredAt: e.occurredAt.toISOString(),
    }));

    return {
      period: `${startOfMonth.getFullYear()}-${String(startOfMonth.getMonth() + 1).padStart(2, '0')}`,
      factExtractions,
      draftGenerations,
      verifications,
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCostMinor: totalCost,
      currency: 'USD',
      budgetMinor: (policy as any).monthlyAiBudgetMinor || 2000,
      generationLimit: (policy as any).monthlyAiGenerationLimit || 200,
      remainingGenerations: Math.max(0, ((policy as any).monthlyAiGenerationLimit || 200) - draftGenerations),
      remainingBudgetMinor: Math.max(0, ((policy as any).monthlyAiBudgetMinor || 2000) - totalCost),
      byModel: byModelMap,
      recentEvents,
      policy,
    };
  }

  async getAutoPilotConfig(workspaceId: string) {
    let policy = await this.prisma.editorialPolicy.findUnique({
      where: { workspaceId },
    });

    if (!policy) {
      policy = await this.prisma.editorialPolicy.create({
        data: {
          workspaceId,
          monthlyAiBudgetMinor: 2000,
          monthlyAiGenerationLimit: 200,
          autoPilotEnabled: false,
          autoPublishIntervalMinutes: 30,
          autoPublishImmediate: false,
          autoPublishMinSafetyScore: 0.8,
          autoPublishPostType: 'LINK',
        } as any,
      });
    }

    return {
      autoPilotEnabled: (policy as any).autoPilotEnabled || false,
      autoPublishTargetPageId: (policy as any).autoPublishTargetPageId || null,
      autoPublishBrandProfileId: (policy as any).autoPublishBrandProfileId || null,
      autoPublishIntervalMinutes: (policy as any).autoPublishIntervalMinutes || 30,
      autoPublishImmediate: (policy as any).autoPublishImmediate || false,
      autoPublishMinSafetyScore: (policy as any).autoPublishMinSafetyScore || 0.8,
      autoPublishPostType: (policy as any).autoPublishPostType || 'LINK',
    };
  }

  async updateAutoPilotConfig(workspaceId: string, data: {
    autoPilotEnabled?: boolean;
    autoPublishTargetPageId?: string | null;
    autoPublishBrandProfileId?: string | null;
    autoPublishIntervalMinutes?: number;
    autoPublishImmediate?: boolean;
    autoPublishMinSafetyScore?: number;
    autoPublishPostType?: string;
  }) {
    const updated = await this.prisma.editorialPolicy.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        monthlyAiBudgetMinor: 2000,
        monthlyAiGenerationLimit: 200,
        ...data,
      } as any,
      update: {
        ...data,
      } as any,
    });

    return updated;
  }
}
