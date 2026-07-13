/* eslint-disable @typescript-eslint/no-explicit-any */
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { DatabaseService } from './common/database.service';
import { MockAuthGuard, PermissionsGuard, RequirePermissions } from './common/auth.guard';
import { QuotaManager } from '@newsflow/database';

@Controller('workspaces/:workspaceId/ai/usage')
@UseGuards(MockAuthGuard, PermissionsGuard)
export class AiUsageController {
  private quotaManager: QuotaManager;

  constructor(private readonly db: DatabaseService) {
    this.quotaManager = new QuotaManager(this.db as any);
  }

  @Get()
  @RequirePermissions('ai.usage.read')
  async getUsage(@Param('workspaceId') workspaceId: string): Promise<any> {
    return this.quotaManager.getUsageSummary(workspaceId);
  }
}
