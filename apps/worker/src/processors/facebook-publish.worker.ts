/* eslint-disable @typescript-eslint/no-explicit-any */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DatabaseService } from '../common/database.service';
import { JsonLogger } from '../common/logger.service';
import { SecretEncryptionService, MockFacebookPagesProvider } from '@newsflow/database';

@Processor('facebook-publish', {
  concurrency: 5,
  limiter: {
    max: 10,
    duration: 1000,
  }
})
export class FacebookPublishWorker extends WorkerHost {
  private encryptionService: SecretEncryptionService;
  private facebookProvider: MockFacebookPagesProvider;

  constructor(
    private readonly db: DatabaseService,
    private readonly logger: JsonLogger,
  ) {
    super();
    this.encryptionService = new SecretEncryptionService();
    this.facebookProvider = new MockFacebookPagesProvider();
  }

  /** Cast to `any` so IDE doesn't need to resolve Prisma generated types. Runtime is fine. */
  private get p(): any { return this.db; }

  async process(job: Job<{ publishJobId: string; workspaceId: string; correlationId: string; createdAt: string }>): Promise<void> {
    const { publishJobId, workspaceId, correlationId } = job.data;
    
    this.logger.log({ message: `Starting facebook-publish job ${publishJobId}`, publishJobId, correlationId, attempt: job.attemptsMade + 1 });

    const publishJob = await this.p.publishJob.findUnique({
      where: { id: publishJobId },
      include: { pageConnection: true }
    });

    if (!publishJob) {
      this.logger.error({ message: `Publish job not found`, publishJobId });
      return; // Stop processing
    }

    if (publishJob.status === 'PUBLISHED') {
      this.logger.log({ message: `Job already published`, publishJobId });
      return;
    }

    // Revalidate Draft Approval
    const draft = await this.p.draft.findUnique({ where: { id: publishJob.draftId } });
    if (!draft || draft.status !== 'APPROVED' || draft.approvalRevokedAt || draft.currentVersionId !== publishJob.draftVersionId) {
      await this.markJobFailed(publishJobId, 'APPROVAL_REVOKED', 'PUBLISH_APPROVAL_REVOKED', 'Draft approval was revoked before publishing');
      return;
    }

    // Attempt creation
    const attemptCount = publishJob.attemptCount + 1;
    await this.p.publishJob.update({
      where: { id: publishJobId },
      data: { status: 'PUBLISHING', attemptCount, startedAt: new Date() }
    });

    const attempt = await this.p.publishAttempt.create({
      data: {
        workspaceId,
        publishJobId,
        attemptNumber: attemptCount,
        startedAt: new Date(),
        requestCorrelationId: correlationId
      }
    });

    try {
      // Decrypt token
      const token = await this.encryptionService.decrypt({
        ciphertext: publishJob.pageConnection.tokenCiphertext,
        iv: publishJob.pageConnection.tokenIv,
        authTag: publishJob.pageConnection.tokenAuthTag,
        keyVersion: publishJob.pageConnection.tokenKeyVersion,
        associatedData: `${workspaceId}:${publishJob.pageConnection.pageId}`
      });

      // Publish
      let result;
      if (publishJob.publicationType === 'LINK' && publishJob.linkSnapshot) {
        result = await this.facebookProvider.publishLinkPost({
          pageAccessToken: token,
          pageId: publishJob.pageConnection.pageId,
          message: publishJob.messageSnapshot,
          link: publishJob.linkSnapshot
        });
      } else {
        result = await this.facebookProvider.publishTextPost({
          pageAccessToken: token,
          pageId: publishJob.pageConnection.pageId,
          message: publishJob.messageSnapshot
        });
      }

      if (result.success) {
        // Success
        await this.p.publishJob.update({
          where: { id: publishJobId },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
            facebookPostId: result.facebookPostId,
            facebookPermalink: result.facebookPermalink
          }
        });

        await this.p.publishAttempt.update({
          where: { id: attempt.id },
          data: {
            success: true,
            finishedAt: new Date(),
            sanitizedResponseJson: result.sanitizedResponseJson
          }
        });

        this.logger.log({ message: `Successfully published to Facebook`, publishJobId, facebookPostId: result.facebookPostId });
      } else {
        // Handle Meta Error
        await this.handleMetaError(publishJobId, attempt.id, result);
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.logger.error({ message: `Exception during publish`, publishJobId, error: err.message });
      await this.handleMetaError(publishJobId, attempt.id, {
        success: false,
        errorCategory: 'TRANSIENT',
        errorCode: 'EXCEPTION',
        errorMessage: err.message
      });
    }
  }

  private async handleMetaError(
    jobId: string,
    attemptId: string,
    result: { success: boolean; errorCategory?: string; errorCode?: string; errorSubcode?: string; errorMessage?: string; sanitizedResponseJson?: unknown }
  ) {
    await this.p.publishAttempt.update({
      where: { id: attemptId },
      data: {
        success: false,
        finishedAt: new Date(),
        providerErrorCategory: result.errorCategory,
        providerErrorCode: result.errorCode,
        providerErrorSubcode: result.errorSubcode,
        sanitizedResponseJson: result.sanitizedResponseJson
      }
    });

    const isRetryable = ['TRANSIENT', 'RATE_LIMIT'].includes(result.errorCategory ?? '');
    
    if (isRetryable) {
      await this.p.publishJob.update({
        where: { id: jobId },
        data: {
          status: 'RETRYING',
          lastErrorCategory: result.errorCategory,
          lastErrorCode: result.errorCode,
          lastErrorMessage: result.errorMessage
        }
      });
      // Throwing error allows BullMQ to retry the job
      throw new Error(`Retryable Meta Error: ${result.errorMessage}`);
    } else {
      // Permanent failure
      await this.markJobFailed(jobId, result.errorCategory ?? 'UNKNOWN', result.errorCode ?? 'UNKNOWN', result.errorMessage ?? 'Unknown error');
    }
  }

  private async markJobFailed(jobId: string, category: string, code: string, message: string) {
    await this.p.publishJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        lastErrorCategory: category,
        lastErrorCode: code,
        lastErrorMessage: message
      }
    });
    this.logger.error({ message: `Publish job permanently failed`, jobId, category, code, msg: message });
  }
}
