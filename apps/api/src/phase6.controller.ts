/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import { MockAuthGuard, PermissionsGuard, RequirePermissions } from './common/auth.guard';
import { SaasService } from './common/services/saas.service';
import { DatabaseService } from './common/database.service';
import { settingsRegistry as settingsRegistryDefinitions } from '@newsflow/database';

class UpsertPlanDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  trialEligible?: boolean;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsInt()
  monthlyPriceMinor?: number;

  @IsOptional()
  @IsInt()
  annualPriceMinor?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsObject()
  limitsJson!: Record<string, unknown>;

  @IsObject()
  featuresJson!: Record<string, unknown>;
}

class CheckoutDto {
  @IsString()
  planId!: string;

  @IsOptional()
  @IsIn(['MONTHLY', 'ANNUAL'])
  billingInterval?: 'MONTHLY' | 'ANNUAL';
}

class WorkspaceSettingDto {
  @IsString()
  key!: string;

  value!: unknown;

  @IsOptional()
  @IsString()
  reason?: string;
}

class SystemSettingDto extends WorkspaceSettingDto {}

class FeatureFlagDto {
  @IsString()
  key!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  defaultEnabled?: boolean;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercentage?: number;

  @IsOptional()
  @IsObject()
  rulesJson?: Record<string, unknown>;
}

class FeatureFlagOverrideDto {
  @IsString()
  scopeType!: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  planCode?: string;

  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

class WhiteLabelDto {
  @IsOptional()
  @IsString()
  productDisplayName?: string;

  @IsOptional()
  @IsString()
  logoObjectKey?: string;

  @IsOptional()
  @IsString()
  faviconObjectKey?: string;

  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  @IsString()
  supportEmail?: string;

  @IsOptional()
  @IsUrl()
  supportUrl?: string;

  @IsOptional()
  @IsUrl()
  privacyUrl?: string;

  @IsOptional()
  @IsUrl()
  termsUrl?: string;

  @IsOptional()
  @IsString()
  emailSenderName?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

class AnnouncementDto {
  @IsString()
  title!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  endsAt?: string;
}

class SuspendDto {
  @IsBoolean()
  suspended!: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}

@Controller('workspaces/:workspaceId')
@UseGuards(MockAuthGuard, PermissionsGuard)
export class WorkspaceBillingController {
  constructor(
    private readonly saasService: SaasService,
    private readonly db: DatabaseService,
  ) {}

  @Get('subscription')
  @RequirePermissions('billing.read')
  async getSubscription(@Param('workspaceId') workspaceId: string): Promise<any> {
    const entitlements = await this.saasService.getResolvedEntitlements(workspaceId);
    return {
      subscription: entitlements.subscription,
      plan: entitlements.plan,
      limits: entitlements.limits,
      features: entitlements.features,
    };
  }

  @Get('usage')
  @RequirePermissions('usage.read')
  async getUsage(@Param('workspaceId') workspaceId: string): Promise<any> {
    return this.saasService.getUsageSummary(workspaceId);
  }

  @Post('subscription/checkout')
  @RequirePermissions('billing.manage')
  async checkout(
    @Param('workspaceId') workspaceId: string,
    @Body() body: CheckoutDto,
    @Headers('x-user-id') userId: string,
  ) {
    return this.saasService.createCheckout(workspaceId, body.planId, body.billingInterval ?? 'MONTHLY', userId || 'SYSTEM');
  }

  @Post('subscription/portal')
  @RequirePermissions('billing.manage')
  async portal(
    @Param('workspaceId') workspaceId: string,
    @Headers('x-user-id') userId: string,
  ) {
    return this.saasService.createPortalSession(workspaceId, userId || 'SYSTEM');
  }

  @Get('settings/effective')
  @RequirePermissions('workspace_settings.read')
  async effectiveSettings(@Param('workspaceId') workspaceId: string) {
    return this.saasService.getEffectiveSettings(workspaceId);
  }

  @Patch('settings')
  @RequirePermissions('workspace_settings.manage')
  async updateWorkspaceSetting(
    @Param('workspaceId') workspaceId: string,
    @Body() body: WorkspaceSettingDto,
    @Headers('x-user-id') userId: string,
  ): Promise<any> {
    return this.saasService.updateWorkspaceSetting(workspaceId, body.key, body.value, userId || 'SYSTEM', body.reason);
  }

  @Delete('settings/:key')
  @RequirePermissions('workspace_settings.manage')
  async resetWorkspaceSetting(
    @Param('workspaceId') workspaceId: string,
    @Param('key') key: string,
    @Headers('x-user-id') userId: string,
    @Query('reason') reason?: string,
  ) {
    await this.saasService.resetWorkspaceSetting(workspaceId, key, userId || 'SYSTEM', reason);
    return { success: true };
  }

  @Get('feature-flags')
  @RequirePermissions('workspace_settings.read')
  async getWorkspaceFlags(
    @Param('workspaceId') workspaceId: string,
    @Headers('x-user-id') userId: string,
  ) {
    const flags = await this.db.featureFlag.findMany({ include: { overrides: true }, orderBy: { key: 'asc' } });
    const items = await Promise.all(
      flags.map(async (flag: any) => ({
        id: flag.id,
        key: flag.key,
        name: flag.name,
        enabled: await this.saasService.evaluateFeature(workspaceId, flag.key, userId || 'SYSTEM'),
        rolloutPercentage: flag.rolloutPercentage,
        status: flag.status,
      })),
    );
    return { items };
  }

  @Get('white-label')
  @RequirePermissions('white_label.read')
  async getWhiteLabel(@Param('workspaceId') workspaceId: string) {
    return this.db.whiteLabelProfile.findUnique({ where: { workspaceId } });
  }

  @Patch('white-label')
  @RequirePermissions('white_label.manage')
  async updateWhiteLabel(
    @Param('workspaceId') workspaceId: string,
    @Body() body: WhiteLabelDto,
    @Headers('x-user-id') userId: string,
  ) {
    return this.saasService.upsertWhiteLabelProfile(workspaceId, body, userId || 'SYSTEM');
  }
}

@Controller('billing/webhooks')
export class BillingWebhookController {
  constructor(private readonly saasService: SaasService) {}

  @Post('mock')
  async mockWebhook(
    @Body() body: any,
    @Headers('x-billing-signature') signature: string,
  ) {
    return this.saasService.processMockWebhook(JSON.stringify(body), signature || '');
  }
}

@Controller('admin')
@UseGuards(MockAuthGuard, PermissionsGuard)
export class AdminPhase6Controller {
  constructor(
    private readonly saasService: SaasService,
    private readonly db: DatabaseService,
  ) {}

  @Get()
  @RequirePermissions('admin.system.read')
  async dashboard() {
    return {
      workspaces: await this.saasService.listAdminWorkspaceSummaries(),
      plans: await this.db.plan.count(),
      featureFlags: await this.db.featureFlag.count(),
      failedWebhooks: await this.db.billingWebhookEvent.count({ where: { status: 'FAILED' } }),
      activeAnnouncements: await this.db.systemAnnouncement.count({ where: { status: 'ACTIVE' } }),
    };
  }

  @Get('workspaces')
  @RequirePermissions('admin.workspaces.read')
  async listWorkspaces() {
    return this.saasService.listAdminWorkspaceSummaries();
  }

  @Post('workspaces/:workspaceId/suspend')
  @RequirePermissions('admin.workspaces.manage')
  async suspendWorkspace(
    @Param('workspaceId') workspaceId: string,
    @Body() body: SuspendDto,
    @Headers('x-user-id') userId: string,
  ): Promise<any> {
    return this.saasService.setWorkspaceSuspension(workspaceId, body.suspended, userId || 'SYSTEM', body.reason);
  }

  @Get('plans')
  @RequirePermissions('plans.read')
  async listPlans(): Promise<any> {
    return this.db.plan.findMany({
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Post('plans')
  @RequirePermissions('plans.manage')
  async createPlan(
    @Body() body: UpsertPlanDto,
    @Headers('x-user-id') userId: string,
  ): Promise<any> {
    return this.saasService.createPlan(body, userId || 'SYSTEM');
  }

  @Patch('plans/:planId')
  @RequirePermissions('plans.manage')
  async updatePlan(
    @Param('planId') planId: string,
    @Body() body: Partial<UpsertPlanDto>,
    @Headers('x-user-id') userId: string,
  ): Promise<any> {
    return this.saasService.updatePlan(planId, body, userId || 'SYSTEM');
  }

  @Get('settings')
  @RequirePermissions('system_settings.read')
  async listSettings(): Promise<any> {
    return Promise.all(
      Object.keys(settingsRegistryDefinitions).map((key) => this.saasService.getEffectiveSystemSetting(key)),
    );
  }

  @Patch('settings')
  @RequirePermissions('system_settings.manage')
  async updateSetting(
    @Body() body: SystemSettingDto,
    @Headers('x-user-id') userId: string,
  ): Promise<any> {
    return this.saasService.updateSystemSetting(body.key, body.value, userId || 'SYSTEM', body.reason);
  }

  @Post('settings/rollback/:historyId')
  @RequirePermissions('system_settings.manage')
  async rollbackSetting(
    @Param('historyId') historyId: string,
    @Headers('x-user-id') userId: string,
    @Query('reason') reason?: string,
  ): Promise<any> {
    return this.saasService.rollbackSystemSetting(historyId, userId || 'SYSTEM', reason);
  }

  @Get('feature-flags')
  @RequirePermissions('feature_flags.read')
  async listFeatureFlags(): Promise<any> {
    return this.db.featureFlag.findMany({ include: { overrides: true }, orderBy: { key: 'asc' } });
  }

  @Post('feature-flags')
  @RequirePermissions('feature_flags.manage')
  async createFeatureFlag(
    @Body() body: FeatureFlagDto,
    @Headers('x-user-id') userId: string,
  ): Promise<any> {
    return this.saasService.createFeatureFlag(body, userId || 'SYSTEM');
  }

  @Post('feature-flags/:flagId/overrides')
  @RequirePermissions('feature_flags.manage')
  async createFeatureFlagOverride(
    @Param('flagId') flagId: string,
    @Body() body: FeatureFlagOverrideDto,
    @Headers('x-user-id') userId: string,
  ) {
    return this.saasService.createFeatureFlagOverride(flagId, body, userId || 'SYSTEM');
  }

  @Get('announcements')
  @RequirePermissions('admin.system.read')
  async listAnnouncements() {
    return this.db.systemAnnouncement.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Post('announcements')
  @RequirePermissions('admin.system.manage')
  async createAnnouncement(
    @Body() body: AnnouncementDto,
    @Headers('x-user-id') userId: string,
  ) {
    return this.saasService.createSystemAnnouncement(body, userId || 'SYSTEM');
  }

  @Get('settings-history')
  @RequirePermissions('admin.system.read')
  async settingsHistory(): Promise<any> {
    return this.db.settingsChangeHistory.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }
}
