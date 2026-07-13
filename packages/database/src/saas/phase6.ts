import { createHmac, createHash } from 'crypto';
import { z } from 'zod';

export const planLimitKeys = [
  'max_connected_pages',
  'max_sources',
  'max_team_members',
  'monthly_ai_drafts',
  'monthly_ai_tokens',
  'monthly_article_extractions',
  'monthly_published_posts',
  'monthly_scheduled_posts',
  'max_brand_profiles',
  'max_retention_days',
  'max_future_schedule_days',
  'max_concurrent_ai_jobs',
  'max_concurrent_publish_jobs',
] as const;

export const planFeatureKeys = [
  'facebook_publishing',
  'scheduled_publishing',
  'email_notifications',
  'multi_source_clustering',
  'ai_secondary_verification',
  'custom_brand_profiles',
  'custom_editorial_policy',
  'advanced_audit_export',
  'white_label',
  'priority_support',
  'api_access_future',
] as const;

export type PlanLimitKey = (typeof planLimitKeys)[number];
export type PlanFeatureKey = (typeof planFeatureKeys)[number];

export const planLimitsSchema = z.object(
  Object.fromEntries(planLimitKeys.map((key) => [key, z.number().int().positive().nullable().optional()])) as unknown as Record<
    PlanLimitKey,
    z.ZodOptional<z.ZodNullable<z.ZodNumber>>
  >,
);

export const planFeaturesSchema = z.object(
  Object.fromEntries(planFeatureKeys.map((key) => [key, z.boolean().optional().default(false)])) as unknown as Record<
    PlanFeatureKey,
    z.ZodDefault<z.ZodOptional<z.ZodBoolean>>
  >,
);

export type PlanLimits = z.infer<typeof planLimitsSchema>;
export type PlanFeatures = z.infer<typeof planFeaturesSchema>;

export type SettingScope = 'SYSTEM' | 'WORKSPACE';

export type SettingDefinition<T> = {
  key: string;
  category: string;
  allowedScopes: SettingScope[];
  schema: z.ZodType<T>;
  defaultValue: T;
  runtimeEditable: boolean;
  requiresRestart: boolean;
  sensitive: boolean;
  workspaceOverrideAllowed: boolean;
  planFeatureRequired?: PlanFeatureKey;
  min?: number;
  max?: number;
  description: string;
};

const nonEmptyUrl = z.string().url();
const timezoneSchema = z.string().min(1);
const languageSchema = z.string().min(2).max(12);
const hexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/);

export const settingsRegistry = {
  'general.registration_enabled': defineSetting({
    key: 'general.registration_enabled',
    category: 'general',
    allowedScopes: ['SYSTEM'],
    schema: z.boolean(),
    defaultValue: true,
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: false,
    description: 'Allow new user registration.',
  }),
  'general.default_language': defineSetting({
    key: 'general.default_language',
    category: 'general',
    allowedScopes: ['SYSTEM', 'WORKSPACE'],
    schema: languageSchema,
    defaultValue: 'vi',
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: true,
    description: 'Default UI language.',
  }),
  'general.default_timezone': defineSetting({
    key: 'general.default_timezone',
    category: 'general',
    allowedScopes: ['SYSTEM', 'WORKSPACE'],
    schema: timezoneSchema,
    defaultValue: 'Asia/Ho_Chi_Minh',
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: true,
    description: 'Default timezone.',
  }),
  'general.support_email': defineSetting({
    key: 'general.support_email',
    category: 'general',
    allowedScopes: ['SYSTEM', 'WORKSPACE'],
    schema: z.string().email(),
    defaultValue: 'support@example.com',
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: true,
    planFeatureRequired: 'white_label',
    description: 'Support email shown to customers.',
  }),
  'general.support_url': defineSetting({
    key: 'general.support_url',
    category: 'general',
    allowedScopes: ['SYSTEM', 'WORKSPACE'],
    schema: nonEmptyUrl,
    defaultValue: 'https://example.com/support',
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: true,
    planFeatureRequired: 'white_label',
    description: 'Support URL.',
  }),
  'general.status_page_url': defineSetting({
    key: 'general.status_page_url',
    category: 'general',
    allowedScopes: ['SYSTEM'],
    schema: nonEmptyUrl,
    defaultValue: 'https://status.example.com',
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: false,
    description: 'Public status page URL.',
  }),
  'general.maintenance_mode': defineSetting({
    key: 'general.maintenance_mode',
    category: 'general',
    allowedScopes: ['SYSTEM'],
    schema: z.boolean(),
    defaultValue: false,
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: false,
    description: 'Read-only maintenance mode.',
  }),
  'general.maintenance_message': defineSetting({
    key: 'general.maintenance_message',
    category: 'general',
    allowedScopes: ['SYSTEM'],
    schema: z.string().min(1).max(280),
    defaultValue: 'He thong dang bao tri ngan.',
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: false,
    description: 'Maintenance message.',
  }),
  'general.public_product_name': defineSetting({
    key: 'general.public_product_name',
    category: 'general',
    allowedScopes: ['SYSTEM', 'WORKSPACE'],
    schema: z.string().min(1).max(80),
    defaultValue: 'NewsFlow AI',
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: true,
    planFeatureRequired: 'white_label',
    description: 'Display product name.',
  }),
  'workspace.default_role_for_invites': defineSetting({
    key: 'workspace.default_role_for_invites',
    category: 'workspace',
    allowedScopes: ['SYSTEM'],
    schema: z.enum(['ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER']),
    defaultValue: 'EDITOR',
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: false,
    description: 'Default invite role.',
  }),
  'workspace.maximum_members_system_hard_limit': defineSetting({
    key: 'workspace.maximum_members_system_hard_limit',
    category: 'workspace',
    allowedScopes: ['SYSTEM'],
    schema: z.number().int().positive(),
    defaultValue: 200,
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: false,
    description: 'System-wide hard cap for members.',
  }),
  'ingestion.minimum_poll_interval_seconds': defineSetting({
    key: 'ingestion.minimum_poll_interval_seconds',
    category: 'ingestion',
    allowedScopes: ['SYSTEM'],
    schema: z.number().int().positive(),
    defaultValue: 300,
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: false,
    description: 'Minimum source polling interval.',
  }),
  'ingestion.default_poll_interval_seconds': defineSetting({
    key: 'ingestion.default_poll_interval_seconds',
    category: 'ingestion',
    allowedScopes: ['SYSTEM', 'WORKSPACE'],
    schema: z.number().int().positive(),
    defaultValue: 900,
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: true,
    description: 'Default source polling interval.',
  }),
  'editorial.require_human_review': defineSetting({
    key: 'editorial.require_human_review',
    category: 'editorial',
    allowedScopes: ['SYSTEM'],
    schema: z.boolean(),
    defaultValue: true,
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: false,
    description: 'Mandatory human review for approval flow.',
  }),
  'editorial.similarity_warning_threshold': defineSetting({
    key: 'editorial.similarity_warning_threshold',
    category: 'editorial',
    allowedScopes: ['SYSTEM', 'WORKSPACE'],
    schema: z.number().min(0).max(1),
    defaultValue: 0.6,
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: true,
    description: 'Similarity warning threshold.',
  }),
  'editorial.similarity_blocking_threshold': defineSetting({
    key: 'editorial.similarity_blocking_threshold',
    category: 'editorial',
    allowedScopes: ['SYSTEM', 'WORKSPACE'],
    schema: z.number().min(0).max(1),
    defaultValue: 0.8,
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: true,
    description: 'Similarity blocking threshold.',
  }),
  'editorial.maximum_quote_words': defineSetting({
    key: 'editorial.maximum_quote_words',
    category: 'editorial',
    allowedScopes: ['SYSTEM', 'WORKSPACE'],
    schema: z.number().int().positive(),
    defaultValue: 25,
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: true,
    description: 'Maximum quotation length.',
  }),
  'editorial.block_high_risk_submission': defineSetting({
    key: 'editorial.block_high_risk_submission',
    category: 'editorial',
    allowedScopes: ['SYSTEM', 'WORKSPACE'],
    schema: z.boolean(),
    defaultValue: true,
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: true,
    description: 'Block high risk content from review submission.',
  }),
  'editorial.require_attribution': defineSetting({
    key: 'editorial.require_attribution',
    category: 'editorial',
    allowedScopes: ['SYSTEM'],
    schema: z.boolean(),
    defaultValue: true,
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: false,
    description: 'Require source attribution.',
  }),
  'ai.enabled': defineSetting({
    key: 'ai.enabled',
    category: 'ai',
    allowedScopes: ['SYSTEM'],
    schema: z.boolean(),
    defaultValue: true,
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: false,
    description: 'Enable AI features globally.',
  }),
  'ai.allowed_providers': defineSetting({
    key: 'ai.allowed_providers',
    category: 'ai',
    allowedScopes: ['SYSTEM'],
    schema: z.array(z.string().min(1)).min(1),
    defaultValue: ['mock', 'gemini'],
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: false,
    description: 'Allowed AI providers.',
  }),
  'ai.default_provider': defineSetting({
    key: 'ai.default_provider',
    category: 'ai',
    allowedScopes: ['SYSTEM', 'WORKSPACE'],
    schema: z.string().min(1),
    defaultValue: 'mock',
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: true,
    description: 'Default AI provider.',
  }),
  'ai.request_timeout_ms': defineSetting({
    key: 'ai.request_timeout_ms',
    category: 'ai',
    allowedScopes: ['SYSTEM'],
    schema: z.number().int().positive(),
    defaultValue: 30000,
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: false,
    description: 'AI timeout.',
  }),
  'ai.maximum_input_characters': defineSetting({
    key: 'ai.maximum_input_characters',
    category: 'ai',
    allowedScopes: ['SYSTEM'],
    schema: z.number().int().positive(),
    defaultValue: 12000,
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: false,
    description: 'Max AI input size.',
  }),
  'billing.trial_duration_days': defineSetting({
    key: 'billing.trial_duration_days',
    category: 'billing',
    allowedScopes: ['SYSTEM'],
    schema: z.number().int().min(0).max(90),
    defaultValue: 14,
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: false,
    description: 'Default trial duration.',
  }),
  'billing.grace_period_days': defineSetting({
    key: 'billing.grace_period_days',
    category: 'billing',
    allowedScopes: ['SYSTEM'],
    schema: z.number().int().min(0).max(60),
    defaultValue: 7,
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: false,
    description: 'Billing grace period.',
  }),
  'notifications.email_enabled': defineSetting({
    key: 'notifications.email_enabled',
    category: 'notifications',
    allowedScopes: ['SYSTEM', 'WORKSPACE'],
    schema: z.boolean(),
    defaultValue: true,
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: true,
    description: 'Allow email notifications.',
  }),
  'white_label.accent_color': defineSetting({
    key: 'white_label.accent_color',
    category: 'white_label',
    allowedScopes: ['WORKSPACE'],
    schema: hexColorSchema,
    defaultValue: '#0f766e',
    runtimeEditable: true,
    requiresRestart: false,
    sensitive: false,
    workspaceOverrideAllowed: true,
    planFeatureRequired: 'white_label',
    description: 'White-label accent color.',
  }),
} as const;

export type SettingKey = keyof typeof settingsRegistry;

function defineSetting<T>(definition: SettingDefinition<T>): SettingDefinition<T> {
  return definition;
}

export function getSettingDefinition(key: string) {
  return settingsRegistry[key as SettingKey];
}

export function parseSettingValue(key: string, value: unknown) {
  const definition = getSettingDefinition(key);
  if (!definition) {
    throw new Error('SETTING_NOT_FOUND');
  }

  return definition.schema.parse(value);
}

export function maskSensitiveValue(isSensitive: boolean, value: unknown) {
  return isSensitive ? { masked: true } : value;
}

export function computeStableRollout(flagKey: string, workspaceId: string, subjectId?: string) {
  const input = `${flagKey}:${workspaceId}:${subjectId ?? ''}`;
  const hash = createHash('sha256').update(input).digest('hex');
  return parseInt(hash.slice(0, 8), 16) % 100;
}

export function resolveFeatureEnabled(input: {
  defaultEnabled: boolean;
  status: 'ACTIVE' | 'DISABLED' | 'ARCHIVED';
  rolloutPercentage: number;
  flagKey: string;
  workspaceId: string;
  subjectId?: string;
  overrides?: Array<{ enabled: boolean; expiresAt?: Date | null }>;
}) {
  if (input.status !== 'ACTIVE') {
    return false;
  }

  const activeOverride = input.overrides?.find((override) => !override.expiresAt || override.expiresAt > new Date());
  if (activeOverride) {
    return activeOverride.enabled;
  }

  if (!input.defaultEnabled) {
    return false;
  }

  return computeStableRollout(input.flagKey, input.workspaceId, input.subjectId) < input.rolloutPercentage;
}

export function resolveLimit(limit: number | null | undefined) {
  return limit == null ? Number.POSITIVE_INFINITY : limit;
}

export function verifyMockWebhookSignature(payload: string, secret: string, signature: string) {
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  return expected === signature;
}

export function createMockWebhookSignature(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function createPayloadHash(payload: string) {
  return createHash('sha256').update(payload).digest('hex');
}

export function transitionSubscriptionState(currentState: string, eventType: string) {
  const transitions: Record<string, Record<string, string>> = {
    INCOMPLETE: {
      'checkout.completed': 'ACTIVE',
      'trial.started': 'TRIALING',
    },
    TRIALING: {
      'payment.succeeded': 'ACTIVE',
      'trial.expired': 'EXPIRED',
      'subscription.cancelled': 'CANCELLED',
    },
    ACTIVE: {
      'payment.failed': 'PAST_DUE',
      'cancel.requested': 'CANCEL_AT_PERIOD_END',
      'subscription.cancelled': 'CANCELLED',
      'workspace.suspended': 'SUSPENDED',
    },
    PAST_DUE: {
      'payment.succeeded': 'ACTIVE',
      'grace.started': 'GRACE_PERIOD',
      'subscription.cancelled': 'CANCELLED',
    },
    GRACE_PERIOD: {
      'payment.succeeded': 'ACTIVE',
      'subscription.expired': 'EXPIRED',
      'subscription.cancelled': 'CANCELLED',
    },
    CANCEL_AT_PERIOD_END: {
      'payment.succeeded': 'ACTIVE',
      'subscription.cancelled': 'CANCELLED',
      'period.ended': 'CANCELLED',
    },
    CANCELLED: {},
    EXPIRED: {
      'checkout.completed': 'ACTIVE',
    },
    SUSPENDED: {
      'workspace.unsuspended': 'ACTIVE',
    },
  };

  return transitions[currentState]?.[eventType] ?? null;
}

export type MockCheckoutSession = {
  sessionId: string;
  checkoutUrl: string;
  providerSubscriptionId: string;
};

export function createMockCheckoutSession(workspaceId: string, planCode: string) {
  const sessionId = `mock_checkout_${workspaceId}_${planCode}_${Date.now()}`;
  return {
    sessionId,
    checkoutUrl: `/mock-billing/checkout/${sessionId}`,
    providerSubscriptionId: `mock_sub_${workspaceId}_${planCode}`,
  } satisfies MockCheckoutSession;
}
