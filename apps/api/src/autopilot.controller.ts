/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { DatabaseService } from './common/database.service';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from './common/auth.guard';
import { QuotaManager } from '@newsflow/database';
import { SaasService } from './common/services/saas.service';

@Controller('workspaces/:workspaceId/autopilot')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AutoPilotController {
  private quotaManager: QuotaManager;

  constructor(
    private readonly db: DatabaseService,
    private readonly saasService: SaasService,
  ) {
    this.quotaManager = new QuotaManager(this.db as any);
  }

  private get p(): any { return this.db; }

  @Get()
  @RequirePermissions('workspace_settings.read')
  async getConfig(@Param('workspaceId') workspaceId: string) {
    const config = await (this.quotaManager as any).getAutoPilotConfig(workspaceId);
    
    // Also fetch available pages and brand profiles for selection convenience
    const pages = await this.p.facebookPageConnection.findMany({
      where: { workspaceId, deletedAt: null, status: 'ACTIVE' },
      select: { pageId: true, pageName: true, status: true },
    });

    const brandProfiles = await this.p.brandProfile.findMany({
      where: { workspaceId, deletedAt: null },
      select: { id: true, name: true, tone: true, isDefault: true },
    });

    // Get recent autonomous publish jobs
    const recentAutoJobs = await this.p.publishJob.findMany({
      where: { workspaceId, createdByUserId: 'AUTOPILOT' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        draftId: true,
        status: true,
        publicationType: true,
        publishAtUtc: true,
        createdAt: true,
        publishedAt: true,
        lastErrorMessage: true,
        pageConnection: { select: { pageName: true } },
      },
    });

    return {
      config,
      availablePages: pages,
      availableBrandProfiles: brandProfiles,
      recentAutoJobs,
    };
  }

  @Put()
  @RequirePermissions('workspace_settings.manage')
  async updateConfig(
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      autoPilotEnabled?: boolean;
      autoPublishTargetPageId?: string | null;
      autoPublishBrandProfileId?: string | null;
      autoPublishIntervalMinutes?: number;
      autoPublishImmediate?: boolean;
      autoPublishMinSafetyScore?: number;
      autoPublishPostType?: string;
    },
    @Headers('x-user-id') userId: string,
  ) {
    await this.saasService.assertActionAllowed(workspaceId, 'draft.generate', userId || 'SYSTEM');
    const updated = await (this.quotaManager as any).updateAutoPilotConfig(workspaceId, body);
    return { success: true, policy: updated };
  }

  @Post('trigger')
  @RequirePermissions('workspace_settings.manage')
  async triggerManualRun(
    @Param('workspaceId') workspaceId: string,
    @Headers('x-user-id') _userId: string,
  ) {
    // Find un-drafted articles for this workspace and trigger generation
    const config = await (this.quotaManager as any).getAutoPilotConfig(workspaceId);
    if (!config.autoPublishTargetPageId) {
      return { success: false, message: 'Vui lòng chọn Fanpage Facebook đích trước khi kích hoạt Auto-Pilot' };
    }

    const defaultBrand = config.autoPublishBrandProfileId
      ? await this.p.brandProfile.findUnique({ where: { id: config.autoPublishBrandProfileId } })
      : await this.p.brandProfile.findFirst({ where: { workspaceId, isDefault: true } }) ||
        await this.p.brandProfile.findFirst({ where: { workspaceId } });

    if (!defaultBrand) {
      return { success: false, message: 'Chưa có Hồ sơ thương hiệu (Brand Profile) nào được thiết lập' };
    }

    const latestArticle = await this.p.article.findFirst({
      where: {
        workspaceId,
        drafts: { none: {} },
      },
      orderBy: { publishedAt: 'desc' },
    });

    if (!latestArticle) {
      return { success: true, message: 'Tất cả bài viết hiện tại đã được tạo bản nháp / xuất bản' };
    }

    return {
      success: true,
      message: `Đã tìm thấy bài viết "${latestArticle.title}" để đưa vào luồng Tự động hóa Auto-Pilot`,
      articleId: latestArticle.id,
      brandProfileId: defaultBrand.id,
    };
  }
}
