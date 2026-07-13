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
    });

    const totalCost = usageEvents.reduce((sum, e) => sum + e.estimatedCostMinor, 0);
    const inputTokens = usageEvents.reduce((sum, e) => sum + e.inputTokens, 0);
    const outputTokens = usageEvents.reduce((sum, e) => sum + e.outputTokens, 0);

    const factExtractions = usageEvents.filter((e) => e.taskType === 'FACT_EXTRACTION').length;
    const draftGenerations = usageEvents.filter((e) => e.taskType === 'DRAFT_GENERATION').length;
    const verifications = usageEvents.filter((e) => e.taskType === 'DRAFT_VERIFICATION').length;

    return {
      period: `${startOfMonth.getFullYear()}-${String(startOfMonth.getMonth() + 1).padStart(2, '0')}`,
      factExtractions,
      draftGenerations,
      verifications,
      inputTokens,
      outputTokens,
      estimatedCostMinor: totalCost,
      currency: 'USD',
      generationLimit: policy!.monthlyAiGenerationLimit,
      remainingGenerations: Math.max(0, policy!.monthlyAiGenerationLimit - draftGenerations),
    };
  }
}
