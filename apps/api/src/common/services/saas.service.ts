/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { getServerEnv } from '@newsflow/config';
import {
  computeStableRollout,
  createMockCheckoutSession,
  createPayloadHash,
  getSettingDefinition,
  maskSensitiveValue,
  parseSettingValue,
  planFeaturesSchema,
  planLimitsSchema,
  resolveFeatureEnabled,
  resolveLimit,
  settingsRegistry,
  transitionSubscriptionState,
  verifyMockWebhookSignature,
} from '@newsflow/database';

type Metric =
  | 'AI_DRAFT_GENERATIONS'
  | 'AI_TOKENS'
  | 'ARTICLE_EXTRACTIONS'
  | 'CONNECTED_PAGES'
  | 'NEWS_SOURCES'
  | 'TEAM_MEMBERS'
  | 'PUBLISHED_POSTS'
  | 'SCHEDULED_POSTS'
  | 'BRAND_PROFILES';

@Injectable()
export class SaasService {
  constructor(
    private readonly db: DatabaseService,
  ) {}

  private get now() {
    return new Date();
  }

  private monthWindow(date = new Date()) {
    return {
      start: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0)),
      end: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0)),
    };
  }

  async seedDefaultsIfMissing() {
    const planCount = await this.db.plan.count();
    if (planCount === 0) {
      const defaults = [
        {
          code: 'FREE_TRIAL',
          name: 'Dung thu',
          description: 'Goi trai nghiem mac dinh',
          status: 'ACTIVE',
          isPublic: true,
          trialEligible: true,
          monthlyPriceMinor: 0,
          annualPriceMinor: 0,
          sortOrder: 0,
          limitsJson: {
            max_connected_pages: 1,
            max_sources: 5,
            max_team_members: 1,
            monthly_ai_drafts: 20,
            monthly_ai_tokens: 50000,
            monthly_article_extractions: 50,
            monthly_published_posts: 20,
            monthly_scheduled_posts: 20,
            max_brand_profiles: 1,
            max_retention_days: 30,
            max_future_schedule_days: 14,
            max_concurrent_ai_jobs: 1,
            max_concurrent_publish_jobs: 1,
          },
          featuresJson: {
            facebook_publishing: true,
            scheduled_publishing: true,
            email_notifications: true,
            multi_source_clustering: true,
            ai_secondary_verification: true,
            custom_brand_profiles: false,
            custom_editorial_policy: false,
            advanced_audit_export: false,
            white_label: false,
            priority_support: false,
            api_access_future: false,
          },
        },
        {
          code: 'STARTER',
          name: 'Starter',
          description: 'Goi co ban',
          status: 'ACTIVE',
          isPublic: true,
          trialEligible: false,
          monthlyPriceMinor: 190000,
          annualPriceMinor: 1900000,
          sortOrder: 1,
          limitsJson: {
            max_connected_pages: 1,
            max_sources: 20,
            max_team_members: 2,
            monthly_ai_drafts: 200,
            monthly_ai_tokens: 500000,
            monthly_article_extractions: 500,
            monthly_published_posts: 200,
            monthly_scheduled_posts: 200,
            max_brand_profiles: 3,
            max_retention_days: 90,
            max_future_schedule_days: 30,
            max_concurrent_ai_jobs: 2,
            max_concurrent_publish_jobs: 2,
          },
          featuresJson: {
            facebook_publishing: true,
            scheduled_publishing: true,
            email_notifications: true,
            multi_source_clustering: true,
            ai_secondary_verification: true,
            custom_brand_profiles: true,
            custom_editorial_policy: true,
            advanced_audit_export: false,
            white_label: false,
            priority_support: false,
            api_access_future: false,
          },
        },
        {
          code: 'PRO',
          name: 'Pro',
          description: 'Goi nang cao',
          status: 'ACTIVE',
          isPublic: true,
          trialEligible: false,
          monthlyPriceMinor: 490000,
          annualPriceMinor: 4900000,
          sortOrder: 2,
          limitsJson: {
            max_connected_pages: 5,
            max_sources: 100,
            max_team_members: 10,
            monthly_ai_drafts: 1000,
            monthly_ai_tokens: 3000000,
            monthly_article_extractions: 2000,
            monthly_published_posts: 1000,
            monthly_scheduled_posts: 1000,
            max_brand_profiles: 10,
            max_retention_days: 180,
            max_future_schedule_days: 90,
            max_concurrent_ai_jobs: 5,
            max_concurrent_publish_jobs: 5,
          },
          featuresJson: {
            facebook_publishing: true,
            scheduled_publishing: true,
            email_notifications: true,
            multi_source_clustering: true,
            ai_secondary_verification: true,
            custom_brand_profiles: true,
            custom_editorial_policy: true,
            advanced_audit_export: true,
            white_label: false,
            priority_support: true,
            api_access_future: false,
          },
        },
        {
          code: 'AGENCY',
          name: 'Agency',
          description: 'Goi agency',
          status: 'ACTIVE',
          isPublic: false,
          trialEligible: false,
          monthlyPriceMinor: 1490000,
          annualPriceMinor: 14900000,
          sortOrder: 3,
          limitsJson: {
            max_connected_pages: 25,
            max_sources: null,
            max_team_members: 50,
            monthly_ai_drafts: 5000,
            monthly_ai_tokens: 15000000,
            monthly_article_extractions: 10000,
            monthly_published_posts: 5000,
            monthly_scheduled_posts: 5000,
            max_brand_profiles: 50,
            max_retention_days: 365,
            max_future_schedule_days: 180,
            max_concurrent_ai_jobs: 10,
            max_concurrent_publish_jobs: 10,
          },
          featuresJson: {
            facebook_publishing: true,
            scheduled_publishing: true,
            email_notifications: true,
            multi_source_clustering: true,
            ai_secondary_verification: true,
            custom_brand_profiles: true,
            custom_editorial_policy: true,
            advanced_audit_export: true,
            white_label: true,
            priority_support: true,
            api_access_future: false,
          },
        },
      ];

      for (const plan of defaults) {
        const created = await this.db.plan.create({ data: plan as any });
        await this.db.planVersion.create({
          data: {
            planId: created.id,
            version: 1,
            currency: created.currency,
            monthlyPriceMinor: created.monthlyPriceMinor,
            annualPriceMinor: created.annualPriceMinor,
            limitsJson: created.limitsJson as any,
            featuresJson: created.featuresJson as any,
          },
        });
      }
    }

    for (const key of Object.keys(settingsRegistry)) {
      const definition = settingsRegistry[key as keyof typeof settingsRegistry];
      await this.db.systemSetting.upsert({
        where: { key },
        update: {},
        create: {
          key,
          category: definition.category,
          valueJson: definition.defaultValue as any,
          isSensitive: definition.sensitive,
          isRuntimeEditable: definition.runtimeEditable,
          requiresRestart: definition.requiresRestart,
          schemaVersion: 1,
        },
      });
    }
  }

  async ensureTrialSubscription(workspaceId: string): Promise<any> {
    await this.seedDefaultsIfMissing();
    const existing = await this.db.subscription.findUnique({
      where: { workspaceId },
      include: { plan: true, planVersion: true },
    });

    if (existing) {
      return existing;
    }

    const plan = await this.db.plan.findFirst({
      where: { code: 'FREE_TRIAL' },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!plan) {
      throw new NotFoundException('PLAN_NOT_FOUND');
    }

    const trialDays = Number((await this.getEffectiveSystemSetting('billing.trial_duration_days')).value);
    const now = this.now;
    const endsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    const subscription = await this.db.subscription.create({
      data: {
        workspaceId,
        planId: plan.id,
        planVersionId: plan.versions[0]?.id,
        provider: 'mock',
        status: 'TRIALING',
        trialStartedAt: now,
        trialEndsAt: endsAt,
        currentPeriodStart: now,
        currentPeriodEnd: endsAt,
        metadataJson: { autoCreatedTrial: true },
      },
      include: { plan: true, planVersion: true },
    });

    await this.db.auditLog.create({
      data: {
        workspaceId,
        actorId: 'SYSTEM',
        actorType: 'SYSTEM',
        action: 'subscription.trial_started',
        resource: 'subscription',
        resourceId: subscription.id,
        afterValues: { planCode: plan.code, trialEndsAt: endsAt.toISOString() } as any,
      },
    });

    return subscription;
  }

  async getSubscription(workspaceId: string): Promise<any> {
    return this.ensureTrialSubscription(workspaceId);
  }

  async getResolvedEntitlements(workspaceId: string): Promise<any> {
    const subscription = await this.ensureTrialSubscription(workspaceId);
    const plan = subscription.plan ?? (await this.db.plan.findUnique({ where: { id: subscription.planId } }));
    const limits = planLimitsSchema.parse((subscription.planVersion?.limitsJson ?? plan?.limitsJson ?? {}) as any);
    const features = planFeaturesSchema.parse((subscription.planVersion?.featuresJson ?? plan?.featuresJson ?? {}) as any);
    return {
      subscription,
      plan,
      limits,
      features,
    };
  }

  async getEffectiveSystemSetting(key: string): Promise<any> {
    const definition = getSettingDefinition(key);
    if (!definition) {
      throw new NotFoundException('SETTING_NOT_FOUND');
    }

    const stored = await this.db.systemSetting.findUnique({ where: { key } });
    const value = stored ? parseSettingValue(key, stored.valueJson) : definition.defaultValue;
    return {
      ...stored,
      key,
      value,
      maskedValue: maskSensitiveValue(definition.sensitive, value),
      definition,
    };
  }

  async getEffectiveSettings(workspaceId: string) {
    await this.seedDefaultsIfMissing();
    const workspaceSettings = await this.db.workspaceSetting.findMany({ where: { workspaceId } });
    const systemSettings = await this.db.systemSetting.findMany();
    const workspaceMap = new Map(workspaceSettings.map((item: any) => [item.key, item]));
    const systemMap = new Map(systemSettings.map((item: any) => [item.key, item]));
    const entitlements = await this.getResolvedEntitlements(workspaceId);

    return Object.keys(settingsRegistry).map((key) => {
      const definition = settingsRegistry[key as keyof typeof settingsRegistry];
      const workspaceOverride = workspaceMap.get(key) as any;
      const systemOverride = systemMap.get(key) as any;
      const baseValue = systemOverride ? parseSettingValue(key, systemOverride.valueJson) : definition.defaultValue;
      const effectiveValue = workspaceOverride ? parseSettingValue(key, workspaceOverride.valueJson) : baseValue;

      return {
        key,
        category: definition.category,
        inherited: !workspaceOverride,
        value: maskSensitiveValue(definition.sensitive, effectiveValue),
        rawValue: definition.sensitive ? undefined : effectiveValue,
        source: workspaceOverride ? 'WORKSPACE' : systemOverride ? 'SYSTEM' : 'DEFAULT',
        requiresRestart: definition.requiresRestart,
        runtimeEditable: definition.runtimeEditable,
        workspaceOverrideAllowed: definition.workspaceOverrideAllowed,
        planFeatureRequired: definition.planFeatureRequired,
        planFeatureEnabled: definition.planFeatureRequired ? Boolean(entitlements.features[definition.planFeatureRequired]) : true,
      };
    });
  }

  async updateSystemSetting(key: string, value: unknown, actorId: string, reason?: string): Promise<any> {
    const definition = getSettingDefinition(key);
    if (!definition) {
      throw new NotFoundException('SETTING_NOT_FOUND');
    }
    if (!definition.allowedScopes.includes('SYSTEM')) {
      throw new BadRequestException('SETTING_OVERRIDE_NOT_ALLOWED');
    }
    if (!definition.runtimeEditable) {
      throw new BadRequestException('SETTING_NOT_EDITABLE');
    }

    const parsed = parseSettingValue(key, value);
    const existing = await this.db.systemSetting.findUnique({ where: { key } });
    const updated = await this.db.systemSetting.upsert({
      where: { key },
      update: {
        valueJson: parsed as any,
        updatedByUserId: actorId,
      },
      create: {
        key,
        category: definition.category,
        valueJson: parsed as any,
        isSensitive: definition.sensitive,
        isRuntimeEditable: definition.runtimeEditable,
        requiresRestart: definition.requiresRestart,
        updatedByUserId: actorId,
      },
    });

    await this.db.settingsChangeHistory.create({
      data: {
        scopeType: 'SYSTEM',
        settingKey: key,
        oldValueJson: existing?.valueJson as any,
        newValueJson: definition.sensitive ? { masked: true } : (parsed as any),
        changedByUserId: actorId,
        reason,
        changeSource: 'API',
      },
    });

    await this.db.auditLog.create({
      data: {
        workspaceId: 'system',
        actorId,
        actorType: 'USER',
        action: 'system_setting.updated',
        resource: 'system_setting',
        resourceId: updated.id,
      },
    });

    return updated;
  }

  async updateWorkspaceSetting(workspaceId: string, key: string, value: unknown, actorId: string, reason?: string): Promise<any> {
    const definition = getSettingDefinition(key);
    if (!definition) {
      throw new NotFoundException('SETTING_NOT_FOUND');
    }
    if (!definition.allowedScopes.includes('WORKSPACE') || !definition.workspaceOverrideAllowed) {
      throw new BadRequestException('SETTING_OVERRIDE_NOT_ALLOWED');
    }
    if (definition.planFeatureRequired) {
      const entitlements = await this.getResolvedEntitlements(workspaceId);
      if (!entitlements.features[definition.planFeatureRequired]) {
        throw new ForbiddenException('SETTING_PLAN_RESTRICTED');
      }
    }

    const parsed = parseSettingValue(key, value);
    const currentSystem = await this.getEffectiveSystemSetting(key);
    const currentValue = currentSystem.value;

    if (typeof currentValue === 'number' && typeof parsed === 'number') {
      const minimumKeys = new Set([
        'ingestion.default_poll_interval_seconds',
        'editorial.maximum_quote_words',
        'editorial.similarity_warning_threshold',
        'editorial.similarity_blocking_threshold',
      ]);

      if (minimumKeys.has(key) && parsed < currentValue) {
        throw new BadRequestException('SETTING_INVALID_VALUE');
      }
    }

    if (key === 'editorial.require_human_review' && parsed === false) {
      throw new ForbiddenException('SETTING_OVERRIDE_NOT_ALLOWED');
    }

    const existing = await this.db.workspaceSetting.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
    });

    const updated = await this.db.workspaceSetting.upsert({
      where: { workspaceId_key: { workspaceId, key } },
      update: {
        category: definition.category,
        valueJson: parsed as any,
        updatedByUserId: actorId,
      },
      create: {
        workspaceId,
        key,
        category: definition.category,
        valueJson: parsed as any,
        updatedByUserId: actorId,
      },
    });

    await this.db.settingsChangeHistory.create({
      data: {
        scopeType: 'WORKSPACE',
        workspaceId,
        settingKey: key,
        oldValueJson: existing?.valueJson as any,
        newValueJson: definition.sensitive ? { masked: true } : (parsed as any),
        changedByUserId: actorId,
        reason,
        changeSource: 'API',
      },
    });

    await this.db.auditLog.create({
      data: {
        workspaceId,
        actorId,
        actorType: 'USER',
        action: 'workspace_setting.updated',
        resource: 'workspace_setting',
        resourceId: updated.id,
      },
    });

    return updated;
  }

  async resetWorkspaceSetting(workspaceId: string, key: string, actorId: string, reason?: string) {
    const existing = await this.db.workspaceSetting.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
    });
    if (!existing) {
      throw new NotFoundException('SETTING_NOT_FOUND');
    }

    await this.db.workspaceSetting.delete({
      where: { workspaceId_key: { workspaceId, key } },
    });

    await this.db.settingsChangeHistory.create({
      data: {
        scopeType: 'WORKSPACE',
        workspaceId,
        settingKey: key,
        oldValueJson: existing.valueJson as any,
        newValueJson: null as any,
        changedByUserId: actorId,
        reason,
        changeSource: 'ROLLBACK',
      },
    });

    await this.db.auditLog.create({
      data: {
        workspaceId,
        actorId,
        actorType: 'USER',
        action: 'workspace_setting.reset',
        resource: 'workspace_setting',
        resourceId: existing.id,
      },
    });
  }

  async rollbackSystemSetting(historyId: string, actorId: string, reason?: string): Promise<any> {
    const history = await this.db.settingsChangeHistory.findUnique({ where: { id: historyId } });
    if (!history || history.scopeType !== 'SYSTEM') {
      throw new NotFoundException('SETTING_ROLLBACK_NOT_ALLOWED');
    }
    return this.updateSystemSetting(history.settingKey, history.oldValueJson, actorId, reason ?? 'Rollback');
  }

  async createPlan(input: any, actorId: string): Promise<any> {
    const limits = planLimitsSchema.parse(input.limitsJson ?? {});
    const features = planFeaturesSchema.parse(input.featuresJson ?? {});
    const plan = await this.db.plan.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description,
        status: input.status ?? 'HIDDEN',
        isPublic: Boolean(input.isPublic),
        trialEligible: Boolean(input.trialEligible),
        currency: input.currency ?? 'USD',
        monthlyPriceMinor: input.monthlyPriceMinor ?? null,
        annualPriceMinor: input.annualPriceMinor ?? null,
        sortOrder: input.sortOrder ?? 0,
        limitsJson: limits as any,
        featuresJson: features as any,
      },
    });

    const version = await this.db.planVersion.create({
      data: {
        planId: plan.id,
        version: 1,
        currency: plan.currency,
        monthlyPriceMinor: plan.monthlyPriceMinor,
        annualPriceMinor: plan.annualPriceMinor,
        limitsJson: limits as any,
        featuresJson: features as any,
      },
    });

    await this.db.auditLog.create({
      data: {
        workspaceId: 'system',
        actorId,
        actorType: 'USER',
        action: 'plan.created',
        resource: 'plan',
        resourceId: plan.id,
      },
    });

    return { ...plan, version };
  }

  async updatePlan(planId: string, input: any, actorId: string): Promise<any> {
    const plan = await this.db.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('PLAN_NOT_FOUND');

    const limits = input.limitsJson ? planLimitsSchema.parse(input.limitsJson) : (plan.limitsJson as any);
    const features = input.featuresJson ? planFeaturesSchema.parse(input.featuresJson) : (plan.featuresJson as any);

    const updated = await this.db.plan.update({
      where: { id: planId },
      data: {
        name: input.name ?? plan.name,
        description: input.description ?? plan.description,
        status: input.status ?? plan.status,
        isPublic: input.isPublic ?? plan.isPublic,
        trialEligible: input.trialEligible ?? plan.trialEligible,
        currency: input.currency ?? plan.currency,
        monthlyPriceMinor: input.monthlyPriceMinor ?? plan.monthlyPriceMinor,
        annualPriceMinor: input.annualPriceMinor ?? plan.annualPriceMinor,
        sortOrder: input.sortOrder ?? plan.sortOrder,
        limitsJson: limits as any,
        featuresJson: features as any,
      },
    });

    const lastVersion = await this.db.planVersion.findFirst({
      where: { planId },
      orderBy: { version: 'desc' },
    });

    const version = await this.db.planVersion.create({
      data: {
        planId,
        version: (lastVersion?.version ?? 0) + 1,
        currency: updated.currency,
        monthlyPriceMinor: updated.monthlyPriceMinor,
        annualPriceMinor: updated.annualPriceMinor,
        limitsJson: limits as any,
        featuresJson: features as any,
      },
    });

    await this.db.auditLog.create({
      data: {
        workspaceId: 'system',
        actorId,
        actorType: 'USER',
        action: 'plan.updated',
        resource: 'plan',
        resourceId: planId,
      },
    });

    return { ...updated, version };
  }

  async createCheckout(workspaceId: string, planId: string, billingInterval: 'MONTHLY' | 'ANNUAL', actorId: string) {
    await this.seedDefaultsIfMissing();
    const plan = await this.db.plan.findUnique({
      where: { id: planId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!plan) throw new NotFoundException('PLAN_NOT_FOUND');

    const session = createMockCheckoutSession(workspaceId, plan.code);
    let customer = await this.db.billingCustomer.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: 'mock' } as any },
    }).catch(() => null);
    if (!customer) {
      customer = await this.db.billingCustomer.create({
        data: {
          workspaceId,
          provider: 'mock',
          providerCustomerId: `mock_cus_${workspaceId}`,
        },
      });
    }

    const subscription = await this.ensureTrialSubscription(workspaceId);
    await this.db.subscription.update({
      where: { id: subscription.id },
      data: {
        planId: plan.id,
        planVersionId: plan.versions[0]?.id,
        billingCustomerId: customer.id,
        provider: 'mock',
        providerSubscriptionId: session.providerSubscriptionId,
        status: 'INCOMPLETE',
        billingInterval,
        metadataJson: {
          ...(subscription.metadataJson as any),
          pendingCheckoutSessionId: session.sessionId,
        },
      },
    });

    await this.db.auditLog.create({
      data: {
        workspaceId,
        actorId,
        actorType: 'USER',
        action: 'billing.checkout_created',
        resource: 'subscription',
        resourceId: subscription.id,
      },
    });

    return session;
  }

  async createPortalSession(workspaceId: string, actorId: string) {
    const subscription = await this.ensureTrialSubscription(workspaceId);
    await this.db.auditLog.create({
      data: {
        workspaceId,
        actorId,
        actorType: 'USER',
        action: 'billing.portal_created',
        resource: 'subscription',
        resourceId: subscription.id,
      },
    });
    return {
      url: `${getServerEnv().BILLING_PORTAL_RETURN_URL}?workspace=${encodeURIComponent(workspaceId)}`,
    };
  }

  async processMockWebhook(payloadText: string, signature: string) {
    const secret = getServerEnv().BILLING_WEBHOOK_SECRET || 'mock-billing-webhook-secret';
    const verified = verifyMockWebhookSignature(payloadText, secret, signature);
    const payload = JSON.parse(payloadText);
    const payloadHash = createPayloadHash(payloadText);

    const existing = await this.db.billingWebhookEvent.findFirst({
      where: { provider: 'mock', providerEventId: payload.id },
    });
    if (existing) {
      return { duplicate: true, verified: existing.signatureVerified };
    }

    const event = await this.db.billingWebhookEvent.create({
      data: {
        provider: 'mock',
        providerEventId: payload.id,
        eventType: payload.type,
        signatureVerified: verified,
        status: verified ? 'RECEIVED' : 'FAILED',
        payloadHash,
        safePayloadJson: payload,
      },
    });

    if (!verified) {
      throw new ForbiddenException('BILLING_WEBHOOK_SIGNATURE_INVALID');
    }

    const subscription = await this.db.subscription.findUnique({
      where: { workspaceId: payload.workspaceId },
    });
    if (!subscription) {
      throw new NotFoundException('SUBSCRIPTION_NOT_FOUND');
    }

    const mappedType = payload.type as string;
    const nextState = transitionSubscriptionState(subscription.status, mappedType);

    await this.db.billingWebhookEvent.update({
      where: { id: event.id },
      data: { status: 'PROCESSING', attemptCount: { increment: 1 } },
    });

    if (nextState) {
      await this.db.subscription.update({
        where: { id: subscription.id },
        data: {
          status: nextState as any,
          currentPeriodStart: payload.currentPeriodStart ? new Date(payload.currentPeriodStart) : subscription.currentPeriodStart,
          currentPeriodEnd: payload.currentPeriodEnd ? new Date(payload.currentPeriodEnd) : subscription.currentPeriodEnd,
          trialEndsAt: payload.trialEndsAt ? new Date(payload.trialEndsAt) : subscription.trialEndsAt,
          gracePeriodEndsAt: payload.gracePeriodEndsAt ? new Date(payload.gracePeriodEndsAt) : subscription.gracePeriodEndsAt,
          cancelAtPeriodEnd: Boolean(payload.cancelAtPeriodEnd ?? subscription.cancelAtPeriodEnd),
          cancelledAt: payload.type === 'subscription.cancelled' ? this.now : subscription.cancelledAt,
          endedAt: payload.type === 'subscription.expired' ? this.now : subscription.endedAt,
          lastProviderSyncAt: this.now,
        },
      });
    }

    await this.db.billingWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: nextState ? 'PROCESSED' : 'IGNORED',
        processedAt: this.now,
      },
    });

    await this.db.auditLog.create({
      data: {
        workspaceId: payload.workspaceId,
        actorId: 'SYSTEM',
        actorType: 'SYSTEM',
        action: nextState ? 'billing.webhook_processed' : 'billing.webhook_failed',
        resource: 'subscription',
        resourceId: subscription.id,
      },
    });

    return { duplicate: false, verified: true, nextState };
  }

  async evaluateFeature(workspaceId: string, key: string, userId?: string) {
    const entitlements = await this.getResolvedEntitlements(workspaceId);
    const flag = await this.db.featureFlag.findUnique({
      where: { key },
      include: { overrides: true },
    });

    const planFeatures = entitlements.features as Record<string, boolean>;
    const planLevelEnabled = planFeatures[key] ?? true;
    if (!planLevelEnabled) {
      return false;
    }

    if (!flag) {
      return true;
    }

    const relevantOverrides = flag.overrides.filter((override: any) => {
      if (override.scopeType === 'WORKSPACE' && override.workspaceId === workspaceId) return true;
      if (override.scopeType === 'USER' && override.userId === userId) return true;
      if (override.scopeType === 'PLAN' && override.planCode === entitlements.plan?.code) return true;
      if (override.scopeType === 'SYSTEM') return true;
      return false;
    });

    return resolveFeatureEnabled({
      defaultEnabled: flag.defaultEnabled,
      status: flag.status,
      rolloutPercentage: flag.rolloutPercentage,
      flagKey: key,
      workspaceId,
      subjectId: userId,
      overrides: relevantOverrides,
    });
  }

  async createFeatureFlag(input: any, actorId: string): Promise<any> {
    const flag = await this.db.featureFlag.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.description,
        defaultEnabled: Boolean(input.defaultEnabled),
        status: input.status ?? 'ACTIVE',
        rolloutPercentage: input.rolloutPercentage ?? 100,
        rulesJson: input.rulesJson ?? null,
      },
    });

    await this.db.auditLog.create({
      data: {
        workspaceId: 'system',
        actorId,
        actorType: 'USER',
        action: 'feature_flag.created',
        resource: 'feature_flag',
        resourceId: flag.id,
      },
    });

    return flag;
  }

  async createFeatureFlagOverride(flagId: string, input: any, actorId: string) {
    const flag = await this.db.featureFlag.findUnique({ where: { id: flagId } });
    if (!flag) throw new NotFoundException('FEATURE_FLAG_NOT_FOUND');

    const override = await this.db.featureFlagOverride.create({
      data: {
        featureFlagId: flagId,
        scopeType: input.scopeType,
        workspaceId: input.workspaceId ?? null,
        userId: input.userId ?? null,
        planCode: input.planCode ?? null,
        enabled: Boolean(input.enabled),
        reason: input.reason,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdByUserId: actorId,
      },
    });

    await this.db.auditLog.create({
      data: {
        workspaceId: input.workspaceId ?? 'system',
        actorId,
        actorType: 'USER',
        action: 'feature_flag.override_created',
        resource: 'feature_flag_override',
        resourceId: override.id,
      },
    });

    return override;
  }

  async getUsageSummary(workspaceId: string): Promise<any> {
    const entitlements = await this.getResolvedEntitlements(workspaceId);
    const { start, end } = this.monthWindow();
    const metrics: Metric[] = [
      'AI_DRAFT_GENERATIONS',
      'AI_TOKENS',
      'ARTICLE_EXTRACTIONS',
      'CONNECTED_PAGES',
      'NEWS_SOURCES',
      'TEAM_MEMBERS',
      'PUBLISHED_POSTS',
      'SCHEDULED_POSTS',
      'BRAND_PROFILES',
    ];

    const rows = await Promise.all(
      metrics.map(async (metric) => {
        const counter = await this.db.usageCounter.findUnique({
          where: {
            workspaceId_metric_periodStart_periodEnd: {
              workspaceId,
              metric,
              periodStart: start,
              periodEnd: end,
            } as any,
          },
        }).catch(() => null);

        const liveUsed = await this.readLiveUsage(workspaceId, metric, start, end);
        const limit = this.resolveMetricLimit(entitlements.limits as Record<string, number | null | undefined>, metric);
        return {
          metric,
          usedQuantity: counter?.usedQuantity ?? liveUsed,
          reservedQuantity: counter?.reservedQuantity ?? 0,
          liveUsed,
          limitQuantity: Number.isFinite(limit) ? limit : null,
          unlimited: !Number.isFinite(limit),
          remaining: Number.isFinite(limit) ? Math.max(0, limit - (counter?.usedQuantity ?? liveUsed) - (counter?.reservedQuantity ?? 0)) : null,
          periodStart: start,
          periodEnd: end,
        };
      }),
    );

    return {
      plan: entitlements.plan,
      subscription: entitlements.subscription,
      metrics: rows,
    };
  }

  private resolveMetricLimit(limits: Record<string, number | null | undefined>, metric: Metric) {
    const mapping: Record<Metric, string> = {
      AI_DRAFT_GENERATIONS: 'monthly_ai_drafts',
      AI_TOKENS: 'monthly_ai_tokens',
      ARTICLE_EXTRACTIONS: 'monthly_article_extractions',
      CONNECTED_PAGES: 'max_connected_pages',
      NEWS_SOURCES: 'max_sources',
      TEAM_MEMBERS: 'max_team_members',
      PUBLISHED_POSTS: 'monthly_published_posts',
      SCHEDULED_POSTS: 'monthly_scheduled_posts',
      BRAND_PROFILES: 'max_brand_profiles',
    };

    return resolveLimit(limits[mapping[metric]]);
  }

  private async readLiveUsage(workspaceId: string, metric: Metric, start: Date, end: Date) {
    if (metric === 'CONNECTED_PAGES') {
      return this.db.facebookPageConnection.count({ where: { workspaceId, deletedAt: null } });
    }
    if (metric === 'NEWS_SOURCES') {
      return this.db.source.count({ where: { workspaceId, deletedAt: null } });
    }
    if (metric === 'BRAND_PROFILES') {
      return this.db.brandProfile.count({ where: { workspaceId, deletedAt: null } });
    }
    if (metric === 'PUBLISHED_POSTS') {
      return this.db.publishJob.count({ where: { workspaceId, status: 'PUBLISHED', createdAt: { gte: start, lt: end } } });
    }
    if (metric === 'SCHEDULED_POSTS') {
      return this.db.publishJob.count({ where: { workspaceId, status: 'SCHEDULED', createdAt: { gte: start, lt: end } } });
    }
    if (metric === 'AI_DRAFT_GENERATIONS') {
      return this.db.aiUsageEvent.count({ where: { workspaceId, occurredAt: { gte: start, lt: end } } });
    }
    if (metric === 'AI_TOKENS') {
      const aggregate = await this.db.aiUsageEvent.aggregate({
        _sum: { inputTokens: true, outputTokens: true },
        where: { workspaceId, occurredAt: { gte: start, lt: end } },
      });
      return (aggregate._sum.inputTokens ?? 0) + (aggregate._sum.outputTokens ?? 0);
    }
    if (metric === 'ARTICLE_EXTRACTIONS') {
      return this.db.article.count({
        where: { workspaceId, extractionStatus: 'SUCCESS', createdAt: { gte: start, lt: end } },
      });
    }
    return 0;
  }

  async assertActionAllowed(workspaceId: string, action: 'source.create' | 'brand_profile.create' | 'facebook.connect' | 'draft.generate' | 'publish' | 'schedule', userId?: string) {
    const subscription = await this.ensureTrialSubscription(workspaceId);
    if (subscription.status === 'SUSPENDED') {
      throw new ForbiddenException('WORKSPACE_SUSPENDED');
    }
    if (['EXPIRED', 'CANCELLED'].includes(subscription.status) && ['draft.generate', 'publish', 'schedule', 'facebook.connect', 'source.create'].includes(action)) {
      throw new ForbiddenException('SUBSCRIPTION_INACTIVE');
    }

    const entitlements = await this.getResolvedEntitlements(workspaceId);
    const limits = entitlements.limits as Record<string, number | null | undefined>;

    if (action === 'source.create') {
      const current = await this.db.source.count({ where: { workspaceId, deletedAt: null } });
      if (current >= this.resolveMetricLimit(limits, 'NEWS_SOURCES')) {
        throw new ConflictException('PLAN_LIMIT_REACHED');
      }
    }
    if (action === 'brand_profile.create') {
      const featureEnabled = await this.evaluateFeature(workspaceId, 'custom_brand_profiles', userId);
      if (!featureEnabled) throw new ForbiddenException('FEATURE_NOT_AVAILABLE');
      const current = await this.db.brandProfile.count({ where: { workspaceId, deletedAt: null } });
      if (current >= this.resolveMetricLimit(limits, 'BRAND_PROFILES')) {
        throw new ConflictException('PLAN_LIMIT_REACHED');
      }
    }
    if (action === 'facebook.connect') {
      const current = await this.db.facebookPageConnection.count({ where: { workspaceId, deletedAt: null } });
      if (current >= this.resolveMetricLimit(limits, 'CONNECTED_PAGES')) {
        throw new ConflictException('PLAN_LIMIT_REACHED');
      }
    }
    if (action === 'publish') {
      const enabled = await this.evaluateFeature(workspaceId, 'facebook_publishing', userId);
      if (!enabled) throw new ForbiddenException('FEATURE_NOT_AVAILABLE');
    }
    if (action === 'schedule') {
      const enabled = await this.evaluateFeature(workspaceId, 'scheduled_publishing', userId);
      if (!enabled) throw new ForbiddenException('FEATURE_NOT_AVAILABLE');
    }
  }

  async reserveUsage(workspaceId: string, metric: Metric, quantity: number, reservationKey: string, actorId = 'SYSTEM') {
    const entitlements = await this.getResolvedEntitlements(workspaceId);
    const { start, end } = this.monthWindow();
    const limit = this.resolveMetricLimit(entitlements.limits as Record<string, number | null | undefined>, metric);
    const expiresAt = new Date(Date.now() + getServerEnv().USAGE_RESERVATION_TTL_MINUTES * 60 * 1000);

    return this.db.$transaction(async (tx: any) => {
      const existing = await tx.usageReservation.findUnique({
        where: { workspaceId_reservationKey: { workspaceId, reservationKey } as any },
      }).catch(() => null);
      if (existing) {
        return existing;
      }

      const liveUsed = await this.readLiveUsage(workspaceId, metric, start, end);
      let counter = await tx.usageCounter.findUnique({
        where: {
          workspaceId_metric_periodStart_periodEnd: {
            workspaceId,
            metric,
            periodStart: start,
            periodEnd: end,
          } as any,
        },
      }).catch(() => null);
      if (!counter) {
        counter = await tx.usageCounter.create({
          data: {
            workspaceId,
            metric,
            periodStart: start,
            periodEnd: end,
            usedQuantity: liveUsed,
            reservedQuantity: 0,
            limitQuantity: Number.isFinite(limit) ? limit : null,
          },
        });
      }

      if (Number.isFinite(limit) && counter.usedQuantity + counter.reservedQuantity + quantity > limit) {
        throw new ConflictException('QUOTA_RESERVATION_FAILED');
      }

      await tx.usageCounter.update({
        where: { id: counter.id },
        data: { reservedQuantity: { increment: quantity }, limitQuantity: Number.isFinite(limit) ? limit : null },
      });
      const reservation = await tx.usageReservation.create({
        data: {
          workspaceId,
          metric,
          quantity,
          reservationKey,
          expiresAt,
        },
      });
      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId,
          actorType: 'USER',
          action: 'usage.reserved',
          resource: 'usage_reservation',
          resourceId: reservation.id,
        },
      });
      return reservation;
    });
  }

  async consumeReservation(workspaceId: string, reservationKey: string, actorId = 'SYSTEM') {
    const { start, end } = this.monthWindow();
    return this.db.$transaction(async (tx: any) => {
      const reservation = await tx.usageReservation.findUnique({
        where: { workspaceId_reservationKey: { workspaceId, reservationKey } as any },
      }).catch(() => null);
      if (!reservation || reservation.status !== 'RESERVED') {
        throw new NotFoundException('QUOTA_RESERVATION_NOT_FOUND');
      }

      const counter = await tx.usageCounter.findUnique({
        where: {
          workspaceId_metric_periodStart_periodEnd: {
            workspaceId,
            metric: reservation.metric,
            periodStart: start,
            periodEnd: end,
          } as any,
        },
      }).catch(() => null);
      if (!counter) {
        throw new NotFoundException('USAGE_COUNTER_NOT_FOUND');
      }

      await tx.usageCounter.update({
        where: { id: counter.id },
        data: {
          reservedQuantity: { decrement: reservation.quantity },
          usedQuantity: { increment: reservation.quantity },
        },
      });
      const updated = await tx.usageReservation.update({
        where: { id: reservation.id },
        data: { status: 'CONSUMED', consumedAt: this.now },
      });
      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId,
          actorType: 'USER',
          action: 'usage.consumed',
          resource: 'usage_reservation',
          resourceId: updated.id,
        },
      });
      return updated;
    });
  }

  async releaseReservation(workspaceId: string, reservationKey: string, actorId = 'SYSTEM') {
    const { start, end } = this.monthWindow();
    return this.db.$transaction(async (tx: any) => {
      const reservation = await tx.usageReservation.findUnique({
        where: { workspaceId_reservationKey: { workspaceId, reservationKey } as any },
      }).catch(() => null);
      if (!reservation || reservation.status !== 'RESERVED') {
        return reservation;
      }

      const counter = await tx.usageCounter.findUnique({
        where: {
          workspaceId_metric_periodStart_periodEnd: {
            workspaceId,
            metric: reservation.metric,
            periodStart: start,
            periodEnd: end,
          } as any,
        },
      }).catch(() => null);
      if (counter) {
        await tx.usageCounter.update({
          where: { id: counter.id },
          data: { reservedQuantity: { decrement: reservation.quantity } },
        });
      }
      const updated = await tx.usageReservation.update({
        where: { id: reservation.id },
        data: { status: 'RELEASED', releasedAt: this.now },
      });
      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId,
          actorType: 'USER',
          action: 'usage.released',
          resource: 'usage_reservation',
          resourceId: updated.id,
        },
      });
      return updated;
    });
  }

  async setWorkspaceSuspension(workspaceId: string, suspended: boolean, actorId: string, reason?: string): Promise<any> {
    const subscription = await this.ensureTrialSubscription(workspaceId);
    const nextStatus = suspended
      ? 'SUSPENDED'
      : ['PAST_DUE', 'GRACE_PERIOD', 'CANCELLED', 'EXPIRED'].includes(subscription.status)
        ? subscription.status
        : 'ACTIVE';
    const updated = await this.db.subscription.update({
      where: { id: subscription.id },
      data: {
        status: nextStatus as any,
        suspensionReason: suspended ? reason ?? 'Suspended by system administrator' : null,
      },
    });

    await this.db.auditLog.create({
      data: {
        workspaceId,
        actorId,
        actorType: 'USER',
        action: suspended ? 'workspace.suspended' : 'workspace.unsuspended',
        resource: 'subscription',
        resourceId: updated.id,
      },
    });

    return updated;
  }

  async upsertWhiteLabelProfile(workspaceId: string, data: any, actorId: string) {
    const enabled = await this.evaluateFeature(workspaceId, 'white_label');
    if (!enabled) {
      throw new ForbiddenException('WHITE_LABEL_NOT_AVAILABLE');
    }
    const urlFields = ['supportUrl', 'privacyUrl', 'termsUrl'];
    for (const field of urlFields) {
      if (data[field] && !/^https?:\/\//.test(data[field])) {
        throw new BadRequestException('WHITE_LABEL_INVALID_ASSET');
      }
    }
    const textFields = ['productDisplayName', 'emailSenderName'];
    for (const field of textFields) {
      if (typeof data[field] === 'string' && /<|>|script/i.test(data[field])) {
        throw new BadRequestException('WHITE_LABEL_INVALID_ASSET');
      }
    }
    const profile = await this.db.whiteLabelProfile.upsert({
      where: { workspaceId },
      update: {
        productDisplayName: data.productDisplayName,
        logoObjectKey: data.logoObjectKey,
        faviconObjectKey: data.faviconObjectKey,
        accentColor: data.accentColor,
        supportEmail: data.supportEmail,
        supportUrl: data.supportUrl,
        privacyUrl: data.privacyUrl,
        termsUrl: data.termsUrl,
        emailSenderName: data.emailSenderName,
        status: data.status ?? 'ACTIVE',
      },
      create: {
        workspaceId,
        productDisplayName: data.productDisplayName,
        logoObjectKey: data.logoObjectKey,
        faviconObjectKey: data.faviconObjectKey,
        accentColor: data.accentColor,
        supportEmail: data.supportEmail,
        supportUrl: data.supportUrl,
        privacyUrl: data.privacyUrl,
        termsUrl: data.termsUrl,
        emailSenderName: data.emailSenderName,
        status: data.status ?? 'ACTIVE',
      },
    });

    await this.db.auditLog.create({
      data: {
        workspaceId,
        actorId,
        actorType: 'USER',
        action: 'white_label.updated',
        resource: 'white_label_profile',
        resourceId: profile.id,
      },
    });

    return profile;
  }

  async createSystemAnnouncement(input: any, actorId: string) {
    const announcement = await this.db.systemAnnouncement.create({
      data: {
        title: input.title,
        message: input.message,
        severity: input.severity ?? 'INFO',
        status: input.status ?? 'ACTIVE',
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        createdByUserId: actorId,
      },
    });

    await this.db.auditLog.create({
      data: {
        workspaceId: 'system',
        actorId,
        actorType: 'USER',
        action: 'system_announcement.created',
        resource: 'system_announcement',
        resourceId: announcement.id,
      },
    });

    return announcement;
  }

  async listAdminWorkspaceSummaries() {
    const subscriptions = await this.db.subscription.findMany({
      include: { plan: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return Promise.all(
      subscriptions.map(async (subscription: any) => ({
        workspaceId: subscription.workspaceId,
        status: subscription.status,
        planCode: subscription.plan?.code,
        suspensionReason: subscription.suspensionReason,
        featureFlagsSample: await this.db.featureFlag.count(),
        rolloutSample: computeStableRollout('billing', subscription.workspaceId),
      })),
    );
  }
}
