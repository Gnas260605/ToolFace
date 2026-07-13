/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * NotificationProcessor — Phase 5
 *
 * Processes outbox events and creates in-app notification records.
 * Determines recipients, checks preferences, respects quiet hours,
 * and queues email delivery jobs.
 *
 * Uses the `notifications` queue.
 */
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { DatabaseService } from '../common/database.service';
import { JsonLogger } from '../common/logger.service';
import { randomUUID } from 'crypto';

export interface NotificationJobPayload {
  outboxEventId: string;
  eventType: string;
  workspaceId: string;
  aggregateType: string;
  aggregateId: string;
  payloadJson: Record<string, unknown>;
  correlationId?: string;
}

// Mapping event type → notification category
const EVENT_CATEGORY: Record<string, string> = {
  'publish.scheduled': 'PUBLISHING',
  'publish.rescheduled': 'PUBLISHING',
  'publish.cancelled': 'PUBLISHING',
  'publish.succeeded': 'PUBLISHING',
  'publish.failed': 'PUBLISHING',
  'publish.result_unknown': 'PUBLISHING',
  'draft.submitted': 'EDITORIAL',
  'draft.approved': 'EDITORIAL',
  'draft.changes_requested': 'EDITORIAL',
  'facebook.reauthorization_required': 'FACEBOOK_CONNECTION',
  'source.health_failing': 'SOURCE_HEALTH',
  'source.auto_disabled': 'SOURCE_HEALTH',
  'ai.usage_warning': 'AI_USAGE',
};

const EVENT_SEVERITY: Record<string, string> = {
  'publish.succeeded': 'SUCCESS',
  'publish.failed': 'ERROR',
  'publish.result_unknown': 'WARNING',
  'facebook.reauthorization_required': 'WARNING',
  'source.auto_disabled': 'WARNING',
  'ai.usage_warning': 'WARNING',
};

@Processor('notifications', { concurrency: 5 })
export class NotificationProcessor extends WorkerHost {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: JsonLogger,
    @InjectQueue('notification-email') private readonly emailQueue: Queue,
  ) {
    super();
  }

  private get p(): any { return this.db; }

  async process(job: Job<NotificationJobPayload>): Promise<void> {
    const { outboxEventId, eventType, workspaceId, aggregateId, payloadJson, correlationId } = job.data;

    this.logger.log({ message: 'Processing notification job', outboxEventId, eventType, workspaceId });

    // 1. Resolve recipients based on event type
    const recipientUserIds = await this.resolveRecipients(eventType, workspaceId, payloadJson);
    if (recipientUserIds.length === 0) {
      this.logger.log({ message: 'No recipients for notification', eventType, workspaceId });
      return;
    }

    const category = EVENT_CATEGORY[eventType] ?? 'SYSTEM';
    const severity = EVENT_SEVERITY[eventType] ?? 'INFO';
    const { title, message, actionUrl } = buildNotificationContent(eventType, payloadJson, aggregateId);

    // 2. Create in-app notifications for each recipient (batch)
    for (const userId of recipientUserIds) {
      try {
        const dedupKey = `${workspaceId}:${userId}:${eventType}:${aggregateId}`;

        // Deduplication: skip if already exists
        const existing = await this.p.notification.findUnique({ where: { deduplicationKey: dedupKey } });
        if (existing) {
          this.logger.log({ message: 'Duplicate notification skipped', dedupKey });
          continue;
        }

        const notification = await this.p.notification.create({
          data: {
            workspaceId,
            userId,
            type: eventType,
            category,
            title,
            message,
            resourceType: 'PublishJob',
            resourceId: aggregateId,
            actionUrl,
            severity,
            status: 'UNREAD',
            deduplicationKey: dedupKey,
            metadataJson: { correlationId, outboxEventId },
          },
        });

        // 3. Check user email preferences and quiet hours
        const prefs = await this.p.notificationPreference.findUnique({
          where: { workspaceId_userId: { workspaceId, userId } },
        });

        const emailEnabled = prefs ? prefs.emailEnabled : true;
        const inAppEnabled = prefs ? prefs.inAppEnabled : true;

        if (!inAppEnabled) {
          // Soft delete / mark as archived immediately if in-app disabled
          await this.p.notification.update({ where: { id: notification.id }, data: { status: 'ARCHIVED' } });
        }

        if (emailEnabled) {
          // Check quiet hours
          let deferUntil: Date | null = null;
          if (prefs?.quietHoursEnabled) {
            const { isInQuietHours, nextWindowEnd } = checkQuietHours(prefs, new Date());
            const isCritical = ['CRITICAL', 'ERROR'].includes(severity) && process.env.NOTIFICATION_CRITICAL_BYPASS_QUIET_HOURS === 'true';
            if (isInQuietHours && !isCritical) {
              deferUntil = nextWindowEnd;
            }
          }

          // Create delivery record
          const delivery = await this.p.notificationDelivery.create({
            data: {
              workspaceId,
              notificationId: notification.id,
              userId,
              channel: 'EMAIL',
              status: deferUntil ? 'PENDING' : 'QUEUED',
              nextAttemptAt: deferUntil ?? new Date(),
            },
          });

          // Enqueue email job (delayed if quiet hours)
          const delayMs = deferUntil ? deferUntil.getTime() - Date.now() : 0;
          await this.emailQueue.add(
            'notification-email',
            {
              deliveryId: delivery.id,
              notificationId: notification.id,
              userId,
              workspaceId,
              eventType,
              correlationId: correlationId ?? randomUUID(),
            },
            {
              delay: delayMs > 0 ? delayMs : 0,
              attempts: parseInt(process.env.EMAIL_MAX_ATTEMPTS ?? '5', 10),
              backoff: { type: 'exponential', delay: 10000 },
            },
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error({ message: 'Failed to create notification for user', userId, eventType, error: msg });
        // Continue processing other recipients — don't fail the whole job
      }
    }

    this.logger.log({ message: 'Notification job complete', eventType, workspaceId, recipientCount: recipientUserIds.length });
  }

  /**
   * Determine which users should receive notifications for this event.
   * Policy: route to relevant workspace members by role.
   */
  private async resolveRecipients(eventType: string, workspaceId: string, payload: Record<string, unknown>): Promise<string[]> {
    // For now, fetch all workspace members and filter by event-type policy
    const members = await this.p.workspaceMember.findMany({
      where: { workspaceId, status: 'ACTIVE' },
      select: { userId: true, role: true },
    }).catch(() => [] as any[]);

    const ownerAdminIds = members.filter((m: any) => ['OWNER', 'ADMIN'].includes(m.role)).map((m: any) => m.userId);
    const schedulerUserId = payload.scheduledBy as string | undefined;
    const draftCreatorId = payload.draftCreatedBy as string | undefined;

    const recipients = new Set<string>(ownerAdminIds);

    if (schedulerUserId) recipients.add(schedulerUserId);
    if (draftCreatorId && ['publish.succeeded', 'publish.failed'].includes(eventType)) {
      recipients.add(draftCreatorId);
    }

    return Array.from(recipients).filter(Boolean);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildNotificationContent(
  eventType: string,
  payload: Record<string, unknown>,
  _aggregateId: string,
): { title: string; message: string; actionUrl: string | null } {
  const templates: Record<string, { title: string; message: string }> = {
    'publish.scheduled': { title: 'Bài viết đã được lên lịch', message: `Bài viết đã được lên lịch đăng lúc ${payload.publishAtUtc ?? ''}.` },
    'publish.rescheduled': { title: 'Lịch đăng đã được cập nhật', message: `Bài viết đã được dời lịch sang ${payload.newPublishAtUtc ?? ''}.` },
    'publish.cancelled': { title: 'Lịch đăng đã bị huỷ', message: `Lịch đăng đã bị huỷ. Lý do: ${payload.reason ?? 'Không có lý do'}.` },
    'publish.succeeded': { title: 'Bài viết đã đăng thành công', message: 'Bài viết đã được đăng lên Trang Facebook thành công.' },
    'publish.failed': { title: 'Đăng bài thất bại', message: `Đăng bài thất bại. Mã lỗi: ${payload.errorCode ?? 'UNKNOWN'}.` },
    'facebook.reauthorization_required': { title: 'Kết nối Facebook cần xác thực lại', message: 'Token của Trang Facebook đã hết hạn. Vui lòng kết nối lại.' },
    'source.auto_disabled': { title: 'Nguồn tin đã bị tắt tự động', message: `Nguồn tin liên tục gặp lỗi và đã bị tắt tự động.` },
  };

  const template = templates[eventType] ?? { title: `Sự kiện: ${eventType}`, message: `Có sự kiện mới: ${eventType}` };

  return {
    ...template,
    actionUrl: null, // Safe internal URLs will be resolved by frontend based on resourceId
  };
}

function checkQuietHours(
  prefs: { quietHoursStart: string; quietHoursEnd: string; quietHoursTimezone: string },
  now: Date,
): { isInQuietHours: boolean; nextWindowEnd: Date } {
  // Simple implementation: parse HH:mm start/end and compute offset
  const tz = prefs.quietHoursTimezone;
  const formatter = new Intl.DateTimeFormat('en', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  const current = hour * 60 + minute;

  const [sh, sm] = prefs.quietHoursStart.split(':').map(Number);
  const [eh, em] = prefs.quietHoursEnd.split(':').map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;

  let isInQuietHours: boolean;
  if (start < end) {
    isInQuietHours = current >= start && current < end;
  } else {
    isInQuietHours = current >= start || current < end;
  }

  // Compute next window end in UTC
  const todayLocal = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const windowEnd = new Date(todayLocal);
  windowEnd.setHours(eh, em, 0, 0);
  if (windowEnd <= now) {
    windowEnd.setDate(windowEnd.getDate() + 1);
  }

  return { isInQuietHours, nextWindowEnd: windowEnd };
}
