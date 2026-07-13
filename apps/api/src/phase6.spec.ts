import { describe, expect, it } from 'vitest';
import {
  computeStableRollout,
  createMockWebhookSignature,
  parseSettingValue,
  planFeaturesSchema,
  planLimitsSchema,
  resolveFeatureEnabled,
  transitionSubscriptionState,
  verifyMockWebhookSignature,
} from '@newsflow/database';

describe('phase 6 helpers', () => {
  it('validates plan limits schema', () => {
    const parsed = planLimitsSchema.parse({
      max_connected_pages: 1,
      max_sources: 10,
      monthly_ai_drafts: 20,
    });

    expect(parsed.max_connected_pages).toBe(1);
    expect(parsed.max_sources).toBe(10);
  });

  it('validates plan features schema', () => {
    const parsed = planFeaturesSchema.parse({
      facebook_publishing: true,
      white_label: false,
    });

    expect(parsed.facebook_publishing).toBe(true);
    expect(parsed.white_label).toBe(false);
  });

  it('keeps rollout deterministic', () => {
    const first = computeStableRollout('billing', 'ws-1', 'user-1');
    const second = computeStableRollout('billing', 'ws-1', 'user-1');

    expect(first).toBe(second);
  });

  it('resolves feature flags with rollout and overrides', () => {
    const enabled = resolveFeatureEnabled({
      defaultEnabled: true,
      status: 'ACTIVE',
      rolloutPercentage: 100,
      flagKey: 'billing',
      workspaceId: 'ws-1',
    });
    const disabledByOverride = resolveFeatureEnabled({
      defaultEnabled: true,
      status: 'ACTIVE',
      rolloutPercentage: 100,
      flagKey: 'billing',
      workspaceId: 'ws-1',
      overrides: [{ enabled: false }],
    });

    expect(enabled).toBe(true);
    expect(disabledByOverride).toBe(false);
  });

  it('transitions subscription states safely', () => {
    expect(transitionSubscriptionState('TRIALING', 'payment.succeeded')).toBe('ACTIVE');
    expect(transitionSubscriptionState('ACTIVE', 'payment.failed')).toBe('PAST_DUE');
    expect(transitionSubscriptionState('CANCELLED', 'payment.succeeded')).toBeNull();
  });

  it('validates known settings and rejects unknown keys', () => {
    expect(parseSettingValue('billing.trial_duration_days', 14)).toBe(14);
    expect(() => parseSettingValue('unknown.setting', true)).toThrowError('SETTING_NOT_FOUND');
  });

  it('verifies signed mock billing webhooks', () => {
    const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.completed' });
    const secret = 'phase6-secret';
    const signature = createMockWebhookSignature(payload, secret);

    expect(verifyMockWebhookSignature(payload, secret, signature)).toBe(true);
    expect(verifyMockWebhookSignature(payload, secret, 'bad-signature')).toBe(false);
  });
});
