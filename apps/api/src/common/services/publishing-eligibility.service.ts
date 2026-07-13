/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';

export interface PublishingEligibilityResult {
  isEligible: boolean;
  errorCode?: string;
  errorMessage?: string;
}

@Injectable()
export class PublishingEligibilityService {
  constructor(private readonly db: DatabaseService) {}

  async evaluate(input: {
    workspaceId: string;
    userId: string;
    draftId: string;
    draftVersionId: string;
    pageConnectionId: string;
  }): Promise<PublishingEligibilityResult> {
    const { workspaceId, draftId, draftVersionId, pageConnectionId } = input;

    // 1. Validate Draft and Version
    const draft = await (this.db as any).draft.findUnique({
      where: { id: draftId },
      include: { versions: true }
    });

    if (!draft || draft.workspaceId !== workspaceId) {
      return { isEligible: false, errorCode: 'PUBLISH_JOB_NOT_FOUND', errorMessage: 'Draft not found in this workspace' };
    }

    if (draft.status !== 'APPROVED') {
      return { isEligible: false, errorCode: 'PUBLISH_DRAFT_NOT_APPROVED', errorMessage: 'Draft must be APPROVED to publish' };
    }

    if (draft.approvalRevokedAt) {
      return { isEligible: false, errorCode: 'PUBLISH_APPROVAL_REVOKED', errorMessage: 'Draft approval has been revoked' };
    }

    if (draft.currentVersionId !== draftVersionId) {
      return { isEligible: false, errorCode: 'PUBLISH_VERSION_MISMATCH', errorMessage: 'Requested publish version does not match the current approved version' };
    }

    // 2. Validate Page Connection
    const connection = await (this.db as any).facebookPageConnection.findUnique({
      where: { id: pageConnectionId }
    });

    if (!connection || connection.workspaceId !== workspaceId) {
      return { isEligible: false, errorCode: 'FACEBOOK_PAGE_CONNECTION_NOT_FOUND', errorMessage: 'Page connection not found' };
    }

    if (connection.status !== 'ACTIVE') {
      return { isEligible: false, errorCode: 'PUBLISH_PAGE_NOT_ACTIVE', errorMessage: 'Page connection is not active' };
    }

    // 3. Check for Duplicate Active Publish Jobs (if any queued or publishing for this draft and page)
    const existingJob = await (this.db as any).publishJob.findFirst({
      where: {
        workspaceId,
        draftId,
        pageConnectionId,
        status: { in: ['QUEUED', 'PUBLISHING', 'RETRYING'] }
      }
    });

    if (existingJob) {
      return { isEligible: false, errorCode: 'PUBLISH_ALREADY_QUEUED', errorMessage: 'An active publish job already exists for this draft and page' };
    }

    return { isEligible: true };
  }
}
