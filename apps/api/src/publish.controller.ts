/* eslint-disable @typescript-eslint/no-explicit-any */
import { Controller, Post, Get, Param, Body, Headers, UseGuards, BadRequestException, ConflictException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DatabaseService } from './common/database.service';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from './common/auth.guard';
import { PublishingEligibilityService } from './common/services/publishing-eligibility.service';
import { JsonLogger } from './common/logger.service';
import { SaasService } from './common/services/saas.service';

@Controller('workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class PublishController {
  constructor(
    private readonly db: DatabaseService,
    private readonly eligibilityService: PublishingEligibilityService,
    private readonly logger: JsonLogger,
    private readonly saasService: SaasService,
    @InjectQueue('facebook-publish') private readonly publishQueue: Queue
  ) {}

  private get p(): any { return this.db; }

  @Post('drafts/:draftId/publish')
  @RequirePermissions('drafts.publish')
  async publishDraft(
    @Param('workspaceId') workspaceId: string,
    @Param('draftId') draftId: string,
    @Body() body: { draftVersionId: string; pageConnectionId: string; publicationType: string; confirmed: boolean },
    @Headers('x-user-id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string
  ) {
    await this.saasService.assertActionAllowed(workspaceId, 'publish', userId || 'SYSTEM');

    if (!idempotencyKey) {
      throw new BadRequestException('idempotency-key header is required');
    }
    if (!body.confirmed) {
      throw new BadRequestException('Publish must be confirmed');
    }

    // Check idempotency first
    const internalIdempotencyKey = `${workspaceId}:${body.pageConnectionId}:${draftId}:${body.draftVersionId}:${body.publicationType}:${idempotencyKey}`;
    const existingJob = await this.p.publishJob.findUnique({
      where: { idempotencyKey: internalIdempotencyKey }
    });

    if (existingJob) {
      return { status: 'QUEUED', publishJobId: existingJob.id };
    }

    // Evaluate eligibility
    const eligibility = await this.eligibilityService.evaluate({
      workspaceId,
      userId,
      draftId,
      draftVersionId: body.draftVersionId,
      pageConnectionId: body.pageConnectionId
    });

    if (!eligibility.isEligible) {
      throw new ConflictException({
        errorCode: eligibility.errorCode,
        message: eligibility.errorMessage
      });
    }

    // Create snapshot
    const version = await this.p.draftVersion.findUnique({
      where: { id: body.draftVersionId }
    });

    // Create publish job transactionally
    const publishJob = await this.p.publishJob.create({
      data: {
        workspaceId,
        draftId,
        draftVersionId: body.draftVersionId,
        pageConnectionId: body.pageConnectionId,
        status: 'QUEUED',
        publicationType: body.publicationType,
        messageSnapshot: version.body, // In real, format headline + body + hashtags
        linkSnapshot: version.recommendedLink,
        idempotencyKey: internalIdempotencyKey,
        createdByUserId: userId || 'SYSTEM',
      }
    });

    // Enqueue
    await this.publishQueue.add(
      'publish',
      {
        publishJobId: publishJob.id,
        workspaceId,
        correlationId: publishJob.id,
        createdAt: publishJob.createdAt.toISOString()
      },
      { 
        jobId: publishJob.id,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      }
    );

    this.logger.log({ message: 'Publish job queued', publishJobId: publishJob.id, workspaceId, draftId });

    return { status: 'QUEUED', publishJobId: publishJob.id };
  }

  @Post('drafts/:draftId/quick-publish')
  @RequirePermissions('drafts.publish')
  async quickPublishDraft(
    @Param('workspaceId') workspaceId: string,
    @Param('draftId') draftId: string,
    @Body() body: { pageConnectionId?: string; publicationType?: string; confirmed: boolean },
    @Headers('x-user-id') userId: string,
    @Headers('idempotency-key') idempotencyKey: string
  ) {
    await this.saasService.assertActionAllowed(workspaceId, 'publish', userId || 'SYSTEM');

    if (!idempotencyKey) {
      throw new BadRequestException('idempotency-key header is required');
    }
    if (!body.confirmed) {
      throw new BadRequestException('Publish must be confirmed');
    }

    // 1. Fetch Draft and verify it has versions
    const draft = await this.p.draft.findFirst({
      where: { id: draftId, workspaceId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (!draft) {
      throw new BadRequestException('Draft not found');
    }
    const latestVersion = draft.versions[0];
    if (!latestVersion) {
      throw new BadRequestException('Draft has no content versions');
    }

    // 2. Resolve Page Connection ID
    let resolvedPageConnectionId = body.pageConnectionId;
    if (!resolvedPageConnectionId) {
      const activeConnection = await this.p.facebookPageConnection.findFirst({
        where: { workspaceId, status: 'ACTIVE' },
      });
      if (activeConnection) {
        resolvedPageConnectionId = activeConnection.id;
      } else if (process.env.FB_PAGE_ID && process.env.FB_PAGE_ACCESS_TOKEN) {
        // Use a placeholder or any connection when override is present
        const anyConnection = await this.p.facebookPageConnection.findFirst({
          where: { workspaceId },
        });
        resolvedPageConnectionId = anyConnection?.id || 'env-override-connection-id';
      } else {
        throw new BadRequestException('Chưa kết nối trang Facebook để đăng bài.');
      }
    }

    // 3. Auto-approve the draft
    if (draft.status !== 'APPROVED') {
      await this.p.draft.update({
        where: { id: draftId },
        data: {
          status: 'APPROVED',
          approvedByUserId: userId || 'SYSTEM',
          approvedAt: new Date(),
        },
      });

      // Record draft review approved
      await this.p.draftReview.create({
        data: {
          workspaceId,
          draftId,
          draftVersionId: latestVersion.id,
          reviewerUserId: userId || 'SYSTEM',
          decision: 'APPROVED',
          comment: 'Tự động phê duyệt qua tính năng Đăng Nhanh.',
        },
      });

      // Log audit
      await this.p.auditLog.create({
        data: {
          workspaceId,
          actorId: userId || 'SYSTEM',
          actorType: 'USER',
          action: 'draft.approved.quick',
          resource: 'draft',
          resourceId: draftId,
          correlationId: `quick-publish-${draftId}`,
        },
      });
    }

    // 4. Delegate to publish draft
    return this.publishDraft(
      workspaceId,
      draftId,
      {
        draftVersionId: latestVersion.id,
        pageConnectionId: resolvedPageConnectionId!,
        publicationType: body.publicationType || 'LINK',
        confirmed: true,
      },
      userId,
      idempotencyKey
    );
  }

  @Get('publish-jobs')
  @RequirePermissions('publishing.read')
  async listPublishJobs(
    @Param('workspaceId') workspaceId: string
  ) {
    const jobs = await this.p.publishJob.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        pageConnection: {
          select: { pageName: true }
        }
      }
    });
    
    return jobs.map((j: any) => ({
      id: j.id,
      draftId: j.draftId,
      status: j.status,
      pageName: j.pageConnection?.pageName,
      publicationType: j.publicationType,
      facebookPostId: j.facebookPostId,
      facebookPermalink: j.facebookPermalink,
      createdAt: j.createdAt,
      lastErrorMessage: j.lastErrorMessage
    }));
  }
}
