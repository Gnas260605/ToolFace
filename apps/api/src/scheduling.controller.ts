/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  Query,
  UseGuards,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DatabaseService } from './common/database.service';
import { MockAuthGuard, PermissionsGuard, RequirePermissions } from './common/auth.guard';
import { JsonLogger } from './common/logger.service';
import { SaasService } from './common/services/saas.service';
import { TimezoneService } from '@newsflow/database';
import { randomUUID } from 'crypto';

const SCHEDULABLE_STATUSES = ['SCHEDULED'];
const CANCELLABLE_STATUSES = ['SCHEDULED', 'DUE'];
const MAX_CALENDAR_DAYS = 93;

@Controller('workspaces/:workspaceId')
@UseGuards(MockAuthGuard, PermissionsGuard)
export class SchedulingController {
  private readonly tzService = new TimezoneService();

  constructor(
    private readonly db: DatabaseService,
    private readonly logger: JsonLogger,
    private readonly saasService: SaasService,
    @InjectQueue('scheduled-publication') private readonly scheduledQueue: Queue,
  ) {}

  /** Cast to `any` so IDE doesn't need to resolve Prisma generated types. */
  private get p(): any { return this.db; }

  // ─── Schedule a draft ────────────────────────────────────────────────────

  @Post('drafts/:draftId/schedule')
  @RequirePermissions('publishing.schedule')
  @HttpCode(HttpStatus.ACCEPTED)
  async scheduleDraft(
    @Param('workspaceId') workspaceId: string,
    @Param('draftId') draftId: string,
    @Body()
    body: {
      draftVersionId: string;
      pageConnectionId: string;
      publicationType: string;
      localPublishDateTime: string;
      timezone: string;
      confirmed?: boolean;
    },
    @Headers('x-user-id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    await this.saasService.assertActionAllowed(workspaceId, 'schedule', userId || 'SYSTEM');

    if (!body.confirmed) {
      throw new BadRequestException('confirmed: true is required to schedule');
    }
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    // 1. Validate timezone + convert to UTC
    const env = {
      minLeadSeconds: parseInt(process.env.SCHEDULER_MIN_LEAD_TIME_SECONDS ?? '120', 10),
      maxFutureDays: parseInt(process.env.SCHEDULER_MAX_FUTURE_DAYS ?? '365', 10),
    };
    const tzResult = this.tzService.convertLocalToUtc(
      body.localPublishDateTime,
      body.timezone,
      new Date(),
      env.minLeadSeconds,
      env.maxFutureDays,
    );
    if (!tzResult.ok) {
      throw new BadRequestException({ code: tzResult.error.code, message: tzResult.error.message });
    }
    const { utc: publishAtUtc } = tzResult.result;

    // 2. Validate draft ownership + approval
    const draft = await this.p.draft.findUnique({ where: { id: draftId } });
    if (!draft || draft.workspaceId !== workspaceId) throw new NotFoundException('Draft not found');
    if (draft.status !== 'APPROVED') {
      throw new BadRequestException({ code: 'SCHEDULE_APPROVAL_REVOKED', message: 'Draft must be APPROVED to schedule' });
    }
    if (draft.currentVersionId !== body.draftVersionId) {
      throw new ConflictException({ code: 'SCHEDULE_IDEMPOTENCY_CONFLICT', message: 'Requested version is not the current approved version' });
    }
    if (draft.approvalRevokedAt) {
      throw new BadRequestException({ code: 'SCHEDULE_APPROVAL_REVOKED', message: 'Approval was revoked' });
    }

    // 3. Validate page connection
    const pageConn = await this.p.facebookPageConnection.findUnique({
      where: { id: body.pageConnectionId },
    });
    if (!pageConn || pageConn.workspaceId !== workspaceId) {
      throw new NotFoundException('Page connection not found');
    }
    if (pageConn.status !== 'ACTIVE') {
      throw new BadRequestException({ code: 'SCHEDULE_PAGE_REAUTH_REQUIRED', message: 'Page connection is not active' });
    }

    // 4. Load draft version snapshot
    const draftVersion = await this.p.draftVersion.findUnique({ where: { id: body.draftVersionId } });
    if (!draftVersion || draftVersion.draftId !== draftId) {
      throw new NotFoundException('Draft version not found');
    }

    // 5. Idempotency check
    const existing = await this.p.publishJob.findUnique({ where: { idempotencyKey } });
    if (existing) {
      return { status: existing.status, publishJobId: existing.id };
    }

    // 6. Build immutable snapshot
    const messageSnapshot = [
      draftVersion.hook,
      draftVersion.body,
      draftVersion.attributionLine,
    ]
      .filter(Boolean)
      .join('\n\n');

    const executionDeadlineUtc = new Date(
      publishAtUtc.getTime() +
        parseInt(process.env.SCHEDULER_EXECUTION_DEADLINE_MINUTES ?? '30', 10) * 60 * 1000,
    );
    const correlationId = randomUUID();

    // 7. Create PublishJob (SCHEDULED) + outbox event in a transaction
    const publishJob = await this.p.$transaction(async (tx: any) => {
      const job = await tx.publishJob.create({
        data: {
          workspaceId,
          draftId,
          draftVersionId: body.draftVersionId,
          pageConnectionId: body.pageConnectionId,
          status: 'SCHEDULED',
          publicationType: body.publicationType ?? 'LINK',
          messageSnapshot,
          linkSnapshot: draftVersion.recommendedLink ?? null,
          idempotencyKey,
          createdByUserId: userId || 'SYSTEM',
          publishAtUtc,
          requestedTimezone: body.timezone,
          requestedLocalTime: body.localPublishDateTime,
          scheduleCreatedAt: new Date(),
          scheduleVersion: 1,
          executionDeadlineUtc,
        },
      });

      // Outbox event for notification system
      await tx.outboxEvent.create({
        data: {
          workspaceId,
          eventType: 'publish.scheduled',
          aggregateType: 'PublishJob',
          aggregateId: job.id,
          payloadJson: {
            publishJobId: job.id,
            draftId,
            draftVersionId: body.draftVersionId,
            pageConnectionId: body.pageConnectionId,
            scheduledBy: userId || 'SYSTEM',
            publishAtUtc: publishAtUtc.toISOString(),
            timezone: body.timezone,
            correlationId,
          },
          correlationId,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: userId || 'SYSTEM',
          action: 'publish.scheduled',
          resource: 'PublishJob',
          resourceId: job.id,
          afterValues: {
            publishJobId: job.id,
            draftId,
            draftVersionId: body.draftVersionId,
            publishAtUtc: publishAtUtc.toISOString(),
            timezone: body.timezone,
            scheduleVersion: 1,
          },
          correlationId,
        },
      });

      return job;
    });

    // 8. Enqueue BullMQ delayed job (DB is authoritative; queue is best-effort)
    const delayMs = publishAtUtc.getTime() - Date.now();
    await this.scheduledQueue.add(
      'scheduled-publication',
      {
        publishJobId: publishJob.id,
        workspaceId,
        scheduleVersion: 1,
        correlationId,
        createdAt: new Date().toISOString(),
      },
      {
        delay: delayMs > 0 ? delayMs : 0,
        jobId: `scheduled-pub-${publishJob.id}-v1`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    this.logger.log({ message: 'Draft scheduled', publishJobId: publishJob.id, publishAtUtc, workspaceId });

    return {
      status: 'SCHEDULED',
      publishJobId: publishJob.id,
      publishAtUtc: publishAtUtc.toISOString(),
      requestedTimezone: body.timezone,
    };
  }

  // ─── Reschedule ──────────────────────────────────────────────────────────

  @Post('publish-jobs/:publishJobId/reschedule')
  @RequirePermissions('publishing.reschedule')
  @HttpCode(HttpStatus.OK)
  async reschedule(
    @Param('workspaceId') workspaceId: string,
    @Param('publishJobId') publishJobId: string,
    @Body() body: { localPublishDateTime: string; timezone: string; reason?: string },
    @Headers('x-user-id') userId: string,
  ) {
    const job = await this.p.publishJob.findUnique({ where: { id: publishJobId } });
    if (!job || job.workspaceId !== workspaceId) throw new NotFoundException('Publish job not found');
    if (!SCHEDULABLE_STATUSES.includes(job.status)) {
      throw new BadRequestException({ code: 'SCHEDULE_RESCHEDULE_NOT_ALLOWED', message: `Cannot reschedule a job in status ${job.status}` });
    }

    const env = {
      minLeadSeconds: parseInt(process.env.SCHEDULER_MIN_LEAD_TIME_SECONDS ?? '120', 10),
      maxFutureDays: parseInt(process.env.SCHEDULER_MAX_FUTURE_DAYS ?? '365', 10),
    };
    const tzResult = this.tzService.convertLocalToUtc(body.localPublishDateTime, body.timezone, new Date(), env.minLeadSeconds, env.maxFutureDays);
    if (!tzResult.ok) {
      throw new BadRequestException({ code: tzResult.error.code, message: tzResult.error.message });
    }

    const newPublishAtUtc = tzResult.result.utc;
    const newVersion = job.scheduleVersion + 1;
    const correlationId = randomUUID();

    await this.p.$transaction(async (tx: any) => {
      await tx.publishJob.update({
        where: { id: publishJobId },
        data: {
          publishAtUtc: newPublishAtUtc,
          requestedTimezone: body.timezone,
          requestedLocalTime: body.localPublishDateTime,
          scheduleVersion: newVersion,
          rescheduledAt: new Date(),
          executionDeadlineUtc: new Date(
            newPublishAtUtc.getTime() +
              parseInt(process.env.SCHEDULER_EXECUTION_DEADLINE_MINUTES ?? '30', 10) * 60 * 1000,
          ),
        },
      });

      await tx.outboxEvent.create({
        data: {
          workspaceId,
          eventType: 'publish.rescheduled',
          aggregateType: 'PublishJob',
          aggregateId: publishJobId,
          payloadJson: {
            publishJobId,
            oldPublishAtUtc: job.publishAtUtc?.toISOString(),
            newPublishAtUtc: newPublishAtUtc.toISOString(),
            timezone: body.timezone,
            rescheduledBy: userId || 'SYSTEM',
            reason: body.reason ?? null,
            scheduleVersion: newVersion,
            correlationId,
          },
          correlationId,
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: userId || 'SYSTEM',
          action: 'publish.rescheduled',
          resource: 'PublishJob',
          resourceId: publishJobId,
          beforeValues: { publishAtUtc: job.publishAtUtc?.toISOString(), scheduleVersion: job.scheduleVersion },
          afterValues: { publishAtUtc: newPublishAtUtc.toISOString(), scheduleVersion: newVersion, reason: body.reason },
          correlationId,
        },
      });
    });

    // Re-enqueue with new version (old queue job will be rejected by version check)
    const delayMs = newPublishAtUtc.getTime() - Date.now();
    await this.scheduledQueue.add(
      'scheduled-publication',
      { publishJobId, workspaceId, scheduleVersion: newVersion, correlationId, createdAt: new Date().toISOString() },
      {
        delay: delayMs > 0 ? delayMs : 0,
        jobId: `scheduled-pub-${publishJobId}-v${newVersion}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    return { status: 'SCHEDULED', publishJobId, publishAtUtc: newPublishAtUtc.toISOString(), scheduleVersion: newVersion };
  }

  // ─── Cancel ──────────────────────────────────────────────────────────────

  @Post('publish-jobs/:publishJobId/cancel')
  @RequirePermissions('publishing.cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('workspaceId') workspaceId: string,
    @Param('publishJobId') publishJobId: string,
    @Body() body: { reason?: string },
    @Headers('x-user-id') userId: string,
  ) {
    const job = await this.p.publishJob.findUnique({ where: { id: publishJobId } });
    if (!job || job.workspaceId !== workspaceId) throw new NotFoundException('Publish job not found');
    if (!CANCELLABLE_STATUSES.includes(job.status)) {
      throw new BadRequestException({ code: 'SCHEDULE_CANCEL_NOT_ALLOWED', message: `Cannot cancel a job in status ${job.status}` });
    }

    const correlationId = randomUUID();

    await this.p.$transaction(async (tx: any) => {
      await tx.publishJob.update({
        where: { id: publishJobId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledByUserId: userId || 'SYSTEM',
          cancellationReason: body.reason ?? null,
        },
      });

      await tx.outboxEvent.create({
        data: {
          workspaceId,
          eventType: 'publish.cancelled',
          aggregateType: 'PublishJob',
          aggregateId: publishJobId,
          payloadJson: {
            publishJobId,
            cancelledBy: userId || 'SYSTEM',
            reason: body.reason ?? null,
            correlationId,
          },
          correlationId,
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: userId || 'SYSTEM',
          action: 'publish.cancelled',
          resource: 'PublishJob',
          resourceId: publishJobId,
          afterValues: { status: 'CANCELLED', reason: body.reason },
          correlationId,
        },
      });
    });

    return { status: 'CANCELLED', publishJobId };
  }

  // ─── Calendar ────────────────────────────────────────────────────────────

  @Get('calendar')
  @RequirePermissions('calendar.read')
  async getCalendar(
    @Param('workspaceId') workspaceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('timezone') timezone: string = process.env.DEFAULT_WORKSPACE_TIMEZONE ?? 'Asia/Ho_Chi_Minh',
    @Query('pageConnectionId') pageConnectionId?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '50',
  ) {
    if (!this.tzService.isValidIanaTimezone(timezone)) {
      throw new BadRequestException({ code: 'SCHEDULE_INVALID_TIMEZONE', message: `Invalid timezone: ${timezone}` });
    }

    const fromDate = from ? new Date(from) : new Date();
    const toDate = to ? new Date(to) : new Date(fromDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Enforce max range
    const diffDays = (toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000);
    if (diffDays > MAX_CALENDAR_DAYS) {
      throw new BadRequestException(`Calendar range cannot exceed ${MAX_CALENDAR_DAYS} days`);
    }

    const pageSize = Math.min(parseInt(limit, 10) || 50, 100);
    const where: any = {
      workspaceId,
      publishAtUtc: { gte: fromDate, lte: toDate },
      ...(status ? { status } : {}),
      ...(pageConnectionId ? { pageConnectionId } : {}),
      ...(cursor ? { id: { gt: cursor } } : {}),
    };

    const jobs = await this.p.publishJob.findMany({
      where,
      orderBy: { publishAtUtc: 'asc' },
      take: pageSize + 1,
      select: {
        id: true,
        workspaceId: true,
        draftId: true,
        draftVersionId: true,
        pageConnectionId: true,
        status: true,
        publicationType: true,
        publishAtUtc: true,
        requestedTimezone: true,
        scheduleVersion: true,
        createdByUserId: true,
        createdAt: true,
        publishedAt: true,
        cancelledAt: true,
        pageConnection: { select: { pageName: true, pageId: true, status: true } },
      },
    });

    const hasNextPage = jobs.length > pageSize;
    const items = hasNextPage ? jobs.slice(0, pageSize) : jobs;
    const nextCursor = hasNextPage ? items[items.length - 1]?.id : null;

    return {
      items: items.map((j: any) => ({
        ...j,
        publishAtLocal: j.publishAtUtc
          ? this.tzService.formatUtcAsLocal(j.publishAtUtc, timezone)
          : null,
        displayTimezone: timezone,
      })),
      nextCursor,
    };
  }

  // ─── Publish job detail ──────────────────────────────────────────────────

  @Get('publish-jobs/:publishJobId')
  @RequirePermissions('publishing.read')
  async getPublishJob(
    @Param('workspaceId') workspaceId: string,
    @Param('publishJobId') publishJobId: string,
  ) {
    const job = await this.p.publishJob.findUnique({
      where: { id: publishJobId },
      include: { pageConnection: { select: { pageName: true, pageId: true, status: true } }, attempts: true },
    });
    if (!job || job.workspaceId !== workspaceId) throw new NotFoundException('Publish job not found');
    // Never return the message snapshot or page token in the response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { messageSnapshot: _s, ...safe } = job;
    return safe;
  }
}

// ─── Notifications Controller ────────────────────────────────────────────────

@Controller('workspaces/:workspaceId')
@UseGuards(MockAuthGuard, PermissionsGuard)
export class NotificationsController {
  constructor(
    private readonly db: DatabaseService,
  ) {}

  private get p(): any { return this.db; }

  @Get('notifications')
  @RequirePermissions('notifications.read')
  async listNotifications(
    @Param('workspaceId') workspaceId: string,
    @Headers('x-user-id') userId: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '30',
  ) {
    const pageSize = Math.min(parseInt(limit, 10) || 30, 100);
    const where: any = {
      workspaceId,
      userId,
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(cursor ? { id: { gt: cursor } } : {}),
    };

    const notifications = await this.p.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: pageSize + 1,
      select: {
        id: true, workspaceId: true, userId: true, type: true, category: true,
        title: true, message: true, resourceType: true, resourceId: true,
        actionUrl: true, severity: true, status: true, createdAt: true,
        readAt: true, archivedAt: true, expiresAt: true,
      },
    });

    const hasNextPage = notifications.length > pageSize;
    const items = hasNextPage ? notifications.slice(0, pageSize) : notifications;
    return { items, nextCursor: hasNextPage ? items[items.length - 1]?.id : null };
  }

  @Get('notifications/unread-count')
  @RequirePermissions('notifications.read')
  async getUnreadCount(
    @Param('workspaceId') workspaceId: string,
    @Headers('x-user-id') userId: string,
  ) {
    const count = await this.p.notification.count({ where: { workspaceId, userId, status: 'UNREAD' } });
    return { count };
  }

  @Post('notifications/:notificationId/read')
  @RequirePermissions('notifications.read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(
    @Param('workspaceId') workspaceId: string,
    @Param('notificationId') notificationId: string,
    @Headers('x-user-id') userId: string,
  ) {
    const n = await this.p.notification.findUnique({ where: { id: notificationId } });
    if (!n || n.workspaceId !== workspaceId || n.userId !== userId) throw new ForbiddenException();
    if (n.status !== 'READ') {
      await this.p.notification.update({ where: { id: notificationId }, data: { status: 'READ', readAt: new Date() } });
    }
  }

  @Post('notifications/read-all')
  @RequirePermissions('notifications.read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllRead(
    @Param('workspaceId') workspaceId: string,
    @Headers('x-user-id') userId: string,
  ) {
    await this.p.notification.updateMany({
      where: { workspaceId, userId, status: 'UNREAD' },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  @Post('notifications/:notificationId/archive')
  @RequirePermissions('notifications.read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @Param('workspaceId') workspaceId: string,
    @Param('notificationId') notificationId: string,
    @Headers('x-user-id') userId: string,
  ) {
    const n = await this.p.notification.findUnique({ where: { id: notificationId } });
    if (!n || n.workspaceId !== workspaceId || n.userId !== userId) throw new ForbiddenException();
    await this.p.notification.update({ where: { id: notificationId }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
  }

  @Get('notification-preferences')
  @RequirePermissions('notifications.read')
  async getPreferences(
    @Param('workspaceId') workspaceId: string,
    @Headers('x-user-id') userId: string,
  ) {
    let prefs = await this.p.notificationPreference.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!prefs) {
      // Lazy create defaults
      prefs = await this.p.notificationPreference.create({
        data: { workspaceId, userId },
      });
    }
    return prefs;
  }

  @Post('notification-preferences')
  @RequirePermissions('notifications.manage_preferences')
  @HttpCode(HttpStatus.OK)
  async updatePreferences(
    @Param('workspaceId') workspaceId: string,
    @Headers('x-user-id') userId: string,
    @Body()
    body: {
      inAppEnabled?: boolean;
      emailEnabled?: boolean;
      editorialEvents?: Record<string, boolean>;
      publishingEvents?: Record<string, boolean>;
      operationalEvents?: Record<string, boolean>;
      quietHours?: { enabled: boolean; start: string; end: string; timezone: string };
    },
  ) {
    // Validate quiet hours timezone if provided
    const tzSvc = new TimezoneService();
    if (body.quietHours?.timezone && !tzSvc.isValidIanaTimezone(body.quietHours.timezone)) {
      throw new BadRequestException({ code: 'NOTIFICATION_PREFERENCE_INVALID', message: 'Invalid quiet hours timezone' });
    }

    const data: any = {};
    if (body.inAppEnabled !== undefined) data.inAppEnabled = body.inAppEnabled;
    if (body.emailEnabled !== undefined) data.emailEnabled = body.emailEnabled;
    if (body.editorialEvents) data.editorialEventsJson = body.editorialEvents;
    if (body.publishingEvents) data.publishingEventsJson = body.publishingEvents;
    if (body.operationalEvents) data.operationalEventsJson = body.operationalEvents;
    if (body.quietHours) {
      data.quietHoursEnabled = body.quietHours.enabled;
      data.quietHoursStart = body.quietHours.start;
      data.quietHoursEnd = body.quietHours.end;
      data.quietHoursTimezone = body.quietHours.timezone;
    }

    return this.p.notificationPreference.upsert({
      where: { workspaceId_userId: { workspaceId, userId } },
      create: { workspaceId, userId, ...data },
      update: data,
    });
  }
}
