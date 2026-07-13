/**
 * Email provider abstraction — Phase 5.
 * Core logic must not depend on a specific email provider.
 * Credentials never reach client bundles.
 */

export type SendEmailInput = {
  to: { email: string; displayName?: string };
  subject: string;
  textBody: string;
  htmlBody?: string;
  idempotencyKey: string;
  correlationId: string;
};

export type EmailSendResult =
  | { ok: true; providerMessageId?: string }
  | {
      ok: false;
      errorCategory:
        | 'TEMPORARY'
        | 'PERMANENT_INVALID_RECIPIENT'
        | 'RATE_LIMITED'
        | 'TIMEOUT'
        | 'DUPLICATE_IDEMPOTENCY'
        | 'PROVIDER_ERROR';
      errorCode: string;
      retryable: boolean;
    };

export interface EmailProvider {
  send(input: SendEmailInput): Promise<EmailSendResult>;
}

// ─── Mock Email Provider ────────────────────────────────────────────────────

type MockBehavior =
  | 'SUCCESS'
  | 'TEMPORARY_FAILURE'
  | 'INVALID_RECIPIENT'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'DUPLICATE';

/** Deterministic mock email provider for tests, CI, and local dev. */
export class MockEmailProvider implements EmailProvider {
  private readonly sentMessages: Map<string, SendEmailInput> = new Map();

  /** Override per-recipient to control behavior in tests. */
  private behaviorOverrides: Map<string, MockBehavior> = new Map();

  setBehavior(email: string, behavior: MockBehavior): void {
    this.behaviorOverrides.set(email, behavior);
  }

  clearBehavior(email: string): void {
    this.behaviorOverrides.delete(email);
  }

  getSentMessages(): SendEmailInput[] {
    return Array.from(this.sentMessages.values());
  }

  clearSentMessages(): void {
    this.sentMessages.clear();
  }

  async send(input: SendEmailInput): Promise<EmailSendResult> {
    const behavior =
      this.behaviorOverrides.get(input.to.email) ??
      (process.env.MOCK_EMAIL_BEHAVIOR as MockBehavior | undefined) ??
      'SUCCESS';

    switch (behavior) {
      case 'SUCCESS':
        if (this.sentMessages.has(input.idempotencyKey)) {
          // Idempotent: return same result without duplicate
          return { ok: true, providerMessageId: `mock-dup-${input.idempotencyKey}` };
        }
        this.sentMessages.set(input.idempotencyKey, input);
        return { ok: true, providerMessageId: `mock-msg-${input.idempotencyKey}` };

      case 'DUPLICATE':
        return { ok: true, providerMessageId: `mock-dup-${input.idempotencyKey}` };

      case 'TEMPORARY_FAILURE':
        return {
          ok: false,
          errorCategory: 'TEMPORARY',
          errorCode: 'MOCK_TEMPORARY_FAILURE',
          retryable: true,
        };

      case 'INVALID_RECIPIENT':
        return {
          ok: false,
          errorCategory: 'PERMANENT_INVALID_RECIPIENT',
          errorCode: 'MOCK_INVALID_RECIPIENT',
          retryable: false,
        };

      case 'TIMEOUT':
        return {
          ok: false,
          errorCategory: 'TIMEOUT',
          errorCode: 'MOCK_TIMEOUT',
          retryable: true,
        };

      case 'RATE_LIMIT':
        return {
          ok: false,
          errorCategory: 'RATE_LIMITED',
          errorCode: 'MOCK_RATE_LIMIT',
          retryable: true,
        };

      default:
        return { ok: true, providerMessageId: `mock-fallback-${input.idempotencyKey}` };
    }
  }
}
