/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Query,
  Headers,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  IsIn,
} from 'class-validator';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DatabaseService } from './common/database.service';
import { MockAuthGuard, PermissionsGuard, RequirePermissions } from './common/auth.guard';
import { SaasService } from './common/services/saas.service';
import { DeterministicVerifier } from '@newsflow/database';

// ---------------------------------------------------------------------------
// Local string-enum constants — mirrors Prisma schema exactly.
// Avoids IDE type-resolution issues with generated @prisma/client enums.
// ---------------------------------------------------------------------------
const DRAFT_STATUS = {
  GENERATING: 'GENERATING',
  DRAFT: 'DRAFT',
  READY_FOR_REVIEW: 'READY_FOR_REVIEW',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  APPROVED: 'APPROVED',
  ARCHIVED: 'ARCHIVED',
} as const;

const CONTENT_TYPE_VALUES = [
  'FACEBOOK_POST',
  'FACEBOOK_REEL_SCRIPT',
  'FACEBOOK_STORY',
  'SHORT_ARTICLE',
] as const;

const REVIEW_DECISION = {
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REJECTED: 'REJECTED',
} as const;

class CreateDraftDto {
  @IsString()
  @IsOptional()
  articleId?: string;

  @IsString()
  @IsOptional()
  clusterId?: string;

  @IsString()
  @IsOptional()
  brandProfileId?: string;
}

class UpdateDraftDto {
  @IsString()
  headline!: string;

  @IsString()
  hook!: string;

  @IsString()
  body!: string;

  @IsString()
  whyItMatters!: string;

  @IsString()
  @IsOptional()
  discussionQuestion?: string;

  @IsArray()
  @IsString({ each: true })
  hashtags!: string[];

  @IsString()
  attributionLine!: string;

  @IsString()
  @IsOptional()
  recommendedLink?: string;

  @IsIn(CONTENT_TYPE_VALUES)
  contentType!: string;

  @IsInt()
  versionNumber!: number;
}

@Controller('workspaces/:workspaceId/drafts')
@UseGuards(MockAuthGuard, PermissionsGuard)
export class DraftsController {
  private verifier: DeterministicVerifier;

  constructor(
    private readonly db: DatabaseService,
    private readonly saasService: SaasService,
    @InjectQueue('fact-extraction') private readonly factQueue: Queue,
    @InjectQueue('draft-generation') private readonly draftGenQueue: Queue,
    @InjectQueue('draft-verification') private readonly draftVerifyQueue: Queue,
  ) {
    this.verifier = new DeterministicVerifier();
  }

  /** Cast to `any` so IDE doesn't need to resolve Prisma generated types. Runtime is fine. */
  private get p(): any {
    return this.db;
  }

  // -------------------------------------------------------------------------
  // POST /drafts — create draft, kick off background jobs
  // -------------------------------------------------------------------------
  @Post()
  @RequirePermissions('drafts.create')
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateDraftDto,
    @Headers('x-user-id') userId: string,
  ): Promise<any> {
    const creatorId = userId || 'SYSTEM';
    await this.saasService.assertActionAllowed(workspaceId, 'draft.generate', creatorId);
    await this.saasService.reserveUsage(workspaceId, 'AI_DRAFT_GENERATIONS', 1, `draft:${dto.articleId ?? dto.clusterId ?? 'new'}:${Date.now()}`, creatorId);

    let brandProfileId = dto.brandProfileId;
    if (!brandProfileId) {
      const defaultProfile = await this.p.brandProfile.findFirst({
        where: { workspaceId, isDefault: true, deletedAt: null },
      });
      if (!defaultProfile) {
        throw new BadRequestException('No default brand profile found. Please specify brandProfileId.');
      }
      brandProfileId = defaultProfile.id;
    } else {
      const checkProfile = await this.p.brandProfile.findFirst({
        where: { id: brandProfileId, workspaceId, deletedAt: null },
      });
      if (!checkProfile) throw new BadRequestException('Brand profile not found in this workspace.');
    }

    if (!dto.articleId && !dto.clusterId) {
      throw new BadRequestException('Either articleId or clusterId must be specified.');
    }

    if (dto.articleId) {
      const art = await this.p.article.findFirst({ where: { id: dto.articleId, workspaceId } });
      if (!art) throw new BadRequestException('Article not found in this workspace.');
    } else if (dto.clusterId) {
      const cluster = await this.p.storyCluster.findFirst({ where: { id: dto.clusterId, workspaceId } });
      if (!cluster) throw new BadRequestException('Story cluster not found in this workspace.');
    }

    const draft = await this.p.draft.create({
      data: {
        workspaceId,
        primaryArticleId: dto.articleId || null,
        clusterId: dto.clusterId || null,
        brandProfileId,
        status: DRAFT_STATUS.GENERATING,
        createdByUserId: creatorId,
      },
    });

    const correlationId = `corr-${draft.id}-${Date.now()}`;

    await this.factQueue.add(
      'extract',
      { articleId: dto.articleId, clusterId: dto.clusterId, workspaceId, correlationId, userId: creatorId },
      { jobId: `fact-ext-${draft.id}-${Date.now()}` },
    );

    await this.draftGenQueue.add(
      'generate',
      { draftId: draft.id, workspaceId, correlationId, userId: creatorId },
      { jobId: `draft-gen-${draft.id}-${Date.now()}`, delay: 2000 },
    );

    return draft;
  }

  // -------------------------------------------------------------------------
  // GET /drafts
  // -------------------------------------------------------------------------
  @Get()
  @RequirePermissions('drafts.read')
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @Query('status') status?: string,
  ): Promise<any> {
    return this.p.draft.findMany({
      where: {
        workspaceId,
        archivedAt: null,
        status: status || undefined,
      },
      include: {
        brandProfile: true,
        versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  // -------------------------------------------------------------------------
  // GET /drafts/:id
  // -------------------------------------------------------------------------
  @Get(':id')
  @RequirePermissions('drafts.read')
  async findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ): Promise<any> {
    const draft = await this.p.draft.findFirst({
      where: { id, workspaceId },
      include: {
        brandProfile: true,
        versions: { orderBy: { versionNumber: 'desc' } },
        reviews: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!draft) throw new NotFoundException('Draft not found');
    return draft;
  }

  // -------------------------------------------------------------------------
  // PATCH /drafts/:id — save editor changes, run deterministic verification
  // -------------------------------------------------------------------------
  @Patch(':id')
  @RequirePermissions('drafts.edit')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDraftDto,
    @Headers('x-user-id') userId: string,
  ): Promise<any> {
    const editorId = userId || 'SYSTEM';

    const draft = await this.p.draft.findFirst({
      where: { id, workspaceId },
      include: {
        versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        brandProfile: true,
      },
    });
    if (!draft) throw new NotFoundException('Draft not found');

    const currentVersion = draft.versions[0];
    if (!currentVersion) {
      throw new BadRequestException('Cannot edit a draft without a generated version.');
    }

    if (dto.versionNumber < currentVersion.versionNumber) {
      throw new ConflictException({
        code: 'OUT_OF_SYNC',
        message: 'Nội dung bản nháp đã được cập nhật ở phiên bản mới hơn. Vui lòng làm mới trang.',
        currentVersion: currentVersion.versionNumber,
      });
    }

    // Resolve source texts for similarity check
    const articles: any[] = [];
    if (draft.primaryArticleId) {
      const art = await this.p.article.findFirst({ where: { id: draft.primaryArticleId, workspaceId } });
      if (art) articles.push(art);
    } else if (draft.clusterId) {
      const cas = await this.p.storyClusterArticle.findMany({
        where: { clusterId: draft.clusterId },
        include: { article: true },
      });
      for (const ca of cas) if (ca.article) articles.push(ca.article);
    }
    const sourceTexts: string[] = articles.map((a: any) => a.contentExcerpt || a.summary || a.title);

    const policy = (await this.p.editorialPolicy.findUnique({ where: { workspaceId } })) ?? {
      maximumSimilarityScore: 0.75,
      maximumQuoteWords: 25,
      blockHighRiskSubmission: true,
    };

    const factSheet = await this.p.factSheet.findFirst({
      where: {
        workspaceId,
        OR: [
          { articleId: draft.primaryArticleId ?? undefined },
          { clusterId: draft.clusterId ?? undefined },
        ],
        status: 'SUCCESS',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!factSheet) throw new BadRequestException('No fact sheet found for this draft.');

    const draftPayload: any = {
      language: draft.brandProfile.language,
      headline: dto.headline,
      hook: dto.hook,
      body: dto.body,
      whyItMatters: dto.whyItMatters,
      discussionQuestion: dto.discussionQuestion,
      hashtags: dto.hashtags,
      attributionLine: dto.attributionLine,
      recommendedLink: dto.recommendedLink,
      contentType: dto.contentType,
      sourceClaimIds: currentVersion.sourceClaimIdsJson as string[],
      riskFlags: currentVersion.riskFlagsJson as string[],
      confidence: 1.0,
    };

    const detReport = this.verifier.verify({
      factSheet: factSheet.factsJson as any,
      generatedDraft: draftPayload,
      sourceTexts,
      editorialPolicy: {
        maximumSimilarityScore: policy.maximumSimilarityScore,
        maximumQuoteWords: policy.maximumQuoteWords,
        blockHighRiskSubmission: policy.blockHighRiskSubmission,
      },
      brandProfile: { forbiddenPhrasesJson: draft.brandProfile.forbiddenPhrasesJson },
    });

    const nextVersionNumber = currentVersion.versionNumber + 1;

    const newVersion = await this.p.draftVersion.create({
      data: {
        workspaceId,
        draftId: draft.id,
        versionNumber: nextVersionNumber,
        headline: dto.headline,
        hook: dto.hook,
        body: dto.body,
        whyItMatters: dto.whyItMatters,
        discussionQuestion: dto.discussionQuestion || null,
        hashtagsJson: dto.hashtags,
        attributionLine: dto.attributionLine,
        recommendedLink: dto.recommendedLink || null,
        contentType: dto.contentType,
        riskFlagsJson: detReport.riskFlags,
        verificationJson: detReport as any,
        similarityScore: detReport.similarityScore,
        sourceClaimIdsJson: currentVersion.sourceClaimIdsJson as any,
        createdByPlain: 'USER',
        createdByUserId: editorId,
      },
    });

    await this.p.draft.update({
      where: { id: draft.id },
      data: { currentVersionId: newVersion.id },
    });

    await this.draftVerifyQueue.add(
      'verify',
      {
        draftId: draft.id,
        versionId: newVersion.id,
        workspaceId,
        correlationId: `corr-edit-${newVersion.id}`,
        userId: editorId,
      },
      { jobId: `verify-${newVersion.id}` },
    );

    return { draftVersion: newVersion, verificationReport: detReport };
  }

  // -------------------------------------------------------------------------
  // POST /drafts/:id/submit
  // -------------------------------------------------------------------------
  @Post(':id/submit')
  @RequirePermissions('drafts.edit')
  async submit(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Headers('x-user-id') userId: string,
  ): Promise<any> {
    const draft = await this.p.draft.findFirst({
      where: { id, workspaceId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (!draft) throw new NotFoundException('Draft not found');

    const currentVersion = draft.versions[0];
    if (!currentVersion) throw new BadRequestException('No draft version exists.');

    const policy = await this.p.editorialPolicy.findUnique({ where: { workspaceId } });
    const blockHighRisk = policy ? policy.blockHighRiskSubmission : true;
    const verification: any = currentVersion.verificationJson;

    if (blockHighRisk && verification?.blockingErrors?.length > 0) {
      throw new BadRequestException({
        code: 'BLOCKING_ERRORS_EXIST',
        message: 'Không thể gửi duyệt bài viết có chứa lỗi nghiêm trọng chưa được khắc phục.',
        errors: verification.blockingErrors,
      });
    }

    const updated = await this.p.draft.update({
      where: { id },
      data: {
        status: DRAFT_STATUS.READY_FOR_REVIEW,
        submittedByUserId: userId || 'SYSTEM',
        submittedAt: new Date(),
      },
    });

    await this.p.auditLog.create({
      data: {
        workspaceId,
        actorId: userId || 'SYSTEM',
        actorType: 'USER',
        action: 'draft.submitted',
        resource: 'draft',
        resourceId: id,
        correlationId: `submit-${id}`,
      },
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // POST /drafts/:id/approve
  // -------------------------------------------------------------------------
  @Post(':id/approve')
  @RequirePermissions('drafts.approve')
  async approve(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Headers('x-user-id') userId: string,
  ): Promise<any> {
    const reviewerId = userId || 'SYSTEM';

    const draft = await this.p.draft.findFirst({
      where: { id, workspaceId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (!draft) throw new NotFoundException('Draft not found');

    const currentVersion = draft.versions[0];
    if (!currentVersion) throw new BadRequestException('No draft version exists.');

    const policy = await this.p.editorialPolicy.findUnique({ where: { workspaceId } });
    if (policy?.requireSeparateReviewer && currentVersion.createdByUserId === reviewerId) {
      throw new ForbiddenException({
        code: 'SEPARATION_OF_DUTIES_VIOLATION',
        message: 'Người tạo bản nháp không được phép tự phê duyệt bài viết của chính mình.',
      });
    }

    const updated = await this.p.draft.update({
      where: { id },
      data: { status: DRAFT_STATUS.APPROVED, approvedByUserId: reviewerId, approvedAt: new Date() },
    });

    await this.p.draftReview.create({
      data: {
        workspaceId,
        draftId: id,
        draftVersionId: currentVersion.id,
        reviewerUserId: reviewerId,
        decision: REVIEW_DECISION.APPROVED,
        comment: 'Phê duyệt xuất bản bài viết.',
      },
    });

    await this.p.auditLog.create({
      data: {
        workspaceId,
        actorId: reviewerId,
        actorType: 'USER',
        action: 'draft.approved',
        resource: 'draft',
        resourceId: id,
        correlationId: `approve-${id}`,
      },
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // POST /drafts/:id/request-changes
  // -------------------------------------------------------------------------
  @Post(':id/request-changes')
  @RequirePermissions('drafts.review')
  async requestChanges(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Headers('x-user-id') userId: string,
    @Body('comment') comment: string,
  ): Promise<any> {
    const reviewerId = userId || 'SYSTEM';

    const draft = await this.p.draft.findFirst({
      where: { id, workspaceId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (!draft) throw new NotFoundException('Draft not found');

    const currentVersion = draft.versions[0];
    if (!currentVersion) throw new BadRequestException('No draft version exists.');

    const updated = await this.p.draft.update({
      where: { id },
      data: { status: DRAFT_STATUS.CHANGES_REQUESTED },
    });

    await this.p.draftReview.create({
      data: {
        workspaceId,
        draftId: id,
        draftVersionId: currentVersion.id,
        reviewerUserId: reviewerId,
        decision: REVIEW_DECISION.CHANGES_REQUESTED,
        comment: comment || 'Yêu cầu chỉnh sửa bài viết.',
      },
    });

    await this.p.auditLog.create({
      data: {
        workspaceId,
        actorId: reviewerId,
        actorType: 'USER',
        action: 'draft.changes_requested',
        resource: 'draft',
        resourceId: id,
        correlationId: `changes-${id}`,
      },
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // POST /drafts/:id/archive
  // -------------------------------------------------------------------------
  @Post(':id/archive')
  @RequirePermissions('drafts.edit')
  async archive(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ): Promise<any> {
    const draft = await this.p.draft.findFirst({ where: { id, workspaceId } });
    if (!draft) throw new NotFoundException('Draft not found');

    return this.p.draft.update({
      where: { id },
      data: { status: DRAFT_STATUS.ARCHIVED, archivedAt: new Date() },
    });
  }
}
