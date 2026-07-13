/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * NotificationEmailProcessor — Phase 5
 *
 * Processes `notification-email` queue items.
 * Renders a versioned template and sends via the email provider.
 * Idempotent: uses delivery ID as the email idempotency key.
 * Retries only temporary errors; stops immediately on permanent failures.
 */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DatabaseService } from '../common/database.service';
import { JsonLogger } from '../common/logger.service';
import { MockEmailProvider, EmailProvider, SendEmailInput } from '@newsflow/database';

export interface EmailDeliveryJobPayload {
  deliveryId: string;
  notificationId: string;
  userId: string;
  workspaceId: string;
  eventType: string;
  correlationId: string;
}

@Processor('notification-email', { concurrency: 10 })
export class NotificationEmailProcessor extends WorkerHost {
  private readonly emailProvider: EmailProvider;

  constructor(
    private readonly db: DatabaseService,
    private readonly logger: JsonLogger,
  ) {
    super();
    // Provider selection — only mock in Phase 5
    const providerType = process.env.EMAIL_PROVIDER ?? 'mock';
    if (providerType === 'mock') {
      this.emailProvider = new MockEmailProvider();
    } else {
      // Future: SMTP adapter would be injected here
      this.emailProvider = new MockEmailProvider();
    }
  }

  private get p(): any { return this.db; }

  async process(job: Job<EmailDeliveryJobPayload>): Promise<void> {
    const { deliveryId, notificationId, userId, workspaceId, eventType, correlationId } = job.data;

    this.logger.log({ message: 'Processing email delivery', deliveryId, notificationId, eventType, correlationId });

    // 1. Reload delivery record
    const delivery = await this.p.notificationDelivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) {
      this.logger.log({ message: 'Delivery not found, skipping', deliveryId });
      return;
    }

    // 2. Idempotency: already sent
    if (delivery.status === 'SENT') {
      this.logger.log({ message: 'Delivery already sent, skipping', deliveryId });
      return;
    }

    // 3. Get recipient email (in real app: look up user email from users table)
    const user = await this.p.user.findUnique({ where: { id: userId } }).catch(() => null);
    const recipientEmail = user?.email ?? `${userId}@mock.newsflow.ai`;
    const recipientName = user?.name ?? userId;

    // 4. Load notification for content
    const notification = await this.p.notification.findUnique({ where: { id: notificationId } });
    if (!notification) {
      await this.markDeliverySkipped(deliveryId, 'NOTIFICATION_NOT_FOUND');
      return;
    }

    // 5. Render template (simplified inline render — full versioned templates in DB)
    const { subject, textBody, htmlBody } = renderTemplate(eventType, {
      title: notification.title,
      message: notification.message,
      workspaceName: workspaceId,
      actionUrl: notification.actionUrl ?? `http://localhost:3000/app/${workspaceId}/notifications`,
    });

    // 6. Send email
    const emailInput: SendEmailInput = {
      to: { email: recipientEmail, displayName: recipientName },
      subject,
      textBody,
      htmlBody,
      idempotencyKey: deliveryId,
      correlationId,
    };

    await this.p.notificationDelivery.update({
      where: { id: deliveryId },
      data: { status: 'SENDING', attemptCount: { increment: 1 } },
    });

    const result = await this.emailProvider.send(emailInput);

    if (result.ok) {
      await this.p.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          provider: process.env.EMAIL_PROVIDER ?? 'mock',
          providerMessageId: result.providerMessageId ?? null,
        },
      });
      this.logger.log({ message: 'Email sent', deliveryId, providerMessageId: result.providerMessageId });
    } else {
      const isRetryable = result.retryable;

      await this.p.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: isRetryable ? 'RETRYING' : 'FAILED',
          lastErrorCode: result.errorCode,
          lastErrorMessage: result.errorCategory,
          failedAt: isRetryable ? null : new Date(),
          nextAttemptAt: isRetryable ? new Date(Date.now() + 60000) : null,
        },
      });

      if (isRetryable) {
        // BullMQ will retry based on job config
        throw new Error(`Email delivery retryable error: ${result.errorCode}`);
      } else {
        // Permanent failure — log and stop
        this.logger.error({ message: 'Email permanently failed', deliveryId, errorCode: result.errorCode, category: result.errorCategory });
      }
    }
  }

  private async markDeliverySkipped(deliveryId: string, reason: string): Promise<void> {
    await this.p.notificationDelivery.update({
      where: { id: deliveryId },
      data: { status: 'SKIPPED', lastErrorCode: reason, failedAt: new Date() },
    });
  }
}

// ─── Template Renderer ───────────────────────────────────────────────────────

function renderTemplate(
  _eventType: string,
  context: { title: string; message: string; workspaceName: string; actionUrl: string },
): { subject: string; textBody: string; htmlBody: string } {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const subject = `[NewsFlow AI] ${escape(context.title)}`;
  const textBody = [
    context.title,
    '',
    context.message,
    '',
    `Xem chi tiết: ${context.actionUrl}`,
    '',
    '--',
    'NewsFlow AI — Hệ thống quản lý nội dung',
  ].join('\n');

  const htmlBody = `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><title>${escape(context.title)}</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <h2 style="color:#1a1a2e">${escape(context.title)}</h2>
  <p>${escape(context.message)}</p>
  <p><a href="${escape(context.actionUrl)}" style="color:#3b82f6">Xem chi tiết</a></p>
  <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
  <p style="font-size:12px;color:#666">NewsFlow AI — Hệ thống quản lý nội dung</p>
  <p style="font-size:12px;color:#666">
    <a href="${escape(context.actionUrl)}" style="color:#666">Quản lý cài đặt thông báo</a>
  </p>
</body>
</html>`;

  return { subject, textBody, htmlBody };
}
