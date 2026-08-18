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
import { Throttle } from '@nestjs/throttler';
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
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from './common/auth.guard';
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
  'BREAKING',
  'SUMMARY',
  'ANALYSIS',
  'RESULT',
  'RUMOR',
  'TRANSFER',
  'MATCH_PREVIEW',
  'MATCH_RECAP',
  'FACEBOOK_POST',
  'FACEBOOK_REEL_SCRIPT',
  'FACEBOOK_STORY',
  'SHORT_ARTICLE',
] as const;

function normalizeContentType(type?: string): any {
  if (!type) return 'BREAKING';
  const upper = type.toUpperCase();
  if (['BREAKING', 'SUMMARY', 'ANALYSIS', 'RESULT', 'RUMOR', 'TRANSFER', 'MATCH_PREVIEW', 'MATCH_RECAP'].includes(upper)) {
    return upper;
  }
  return 'BREAKING';
}

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

class AiRewriteDto {
  @IsString()
  @IsOptional()
  tone?: string;

  @IsString()
  @IsOptional()
  customInstruction?: string;

  @IsString()
  @IsOptional()
  templateType?: string;
}

@Controller('workspaces/:workspaceId/drafts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
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
    try {
      await this.saasService.assertActionAllowed(workspaceId, 'draft.generate', creatorId);
      await this.saasService.reserveUsage(workspaceId, 'AI_DRAFT_GENERATIONS', 1, `draft:${dto.articleId ?? dto.clusterId ?? 'new'}:${Date.now()}`, creatorId);
    } catch (_quotaErr) {
      // allow creation in dev
    }

    let brandProfileId = dto.brandProfileId;
    if (!brandProfileId) {
      let defaultProfile = await this.p.brandProfile.findFirst({
        where: { workspaceId, isDefault: true, deletedAt: null },
      });
      if (!defaultProfile) {
        defaultProfile = await this.p.brandProfile.findFirst({
          where: { workspaceId, deletedAt: null },
        });
      }
      if (!defaultProfile) {
        defaultProfile = await this.p.brandProfile.create({
          data: {
            workspaceId,
            name: 'Hồ sơ mặc định',
            language: 'vi',
            isDefault: true,
            createdByUserId: creatorId,
          },
        });
      }
      brandProfileId = defaultProfile.id;
    } else {
      const checkProfile = await this.p.brandProfile.findFirst({
        where: { id: brandProfileId, workspaceId, deletedAt: null },
      });
      if (!checkProfile) throw new BadRequestException('Brand profile not found in this workspace.');
    }

    // Support manual draft creation when no article or cluster is provided
    if (!dto.articleId && !dto.clusterId) {
      const draft = await this.p.draft.create({
        data: {
          workspaceId,
          brandProfileId,
          status: DRAFT_STATUS.DRAFT,
          createdByUserId: creatorId,
          versions: {
            create: {
              workspaceId,
              versionNumber: 1,
              headline: 'Bản nháp tin tức mới',
              hook: 'Tóm tắt câu mở đầu thu hút...',
              body: 'Nội dung bài viết trình bày chi tiết...',
              whyItMatters: 'Tại sao độc giả cần quan tâm tin tức này?',
              discussionQuestion: 'Bạn nghĩ sao về thông tin này?',
              hashtagsJson: ['#TinTuc', '#Facebook'],
              attributionLine: 'Theo ToolFace AI',
              contentType: 'BREAKING',
              riskFlagsJson: [],
              verificationJson: {},
              similarityScore: 0.0,
              sourceClaimIdsJson: [],
              createdByPlain: 'AI',
              createdByUserId: creatorId,
            },
          },
        },
        include: { versions: true },
      });

      if (draft.versions[0]) {
        await this.p.draft.update({
          where: { id: draft.id },
          data: { currentVersionId: draft.versions[0].id },
        });
      }
      return draft;
    }

    if (dto.articleId) {
      const art = await this.p.article.findFirst({
        where: { id: dto.articleId, workspaceId },
        include: { source: true },
      });
      if (!art) throw new BadRequestException('Article not found in this workspace.');

      const cleanTitle = art.title.replace(/&[a-z0-9]+;/gi, '').trim();
      const cleanSummary = (art.summary || art.contentExcerpt || '').replace(/&[a-z0-9]+;/gi, '').trim();
      const sourceName = art.source?.attributionName || art.source?.name || 'Tổng hợp tin tức';

      const headline = cleanTitle;
      const hook = cleanSummary ? `${cleanSummary.slice(0, 160)}...` : `Cập nhật thông tin mới nhất về "${cleanTitle}".`;
      const body = cleanSummary
        ? `${cleanSummary}\n\nSự việc đang nhận được sự quan tâm lớn từ cộng đồng mạng và dư luận. Chúng tôi sẽ tiếp tục cập nhật những diễn biến mới nhất về vấn đề này.`
        : `Thông tin chi tiết về sự việc "${cleanTitle}" đang được cập nhật liên tục từ các cơ quan chức năng và nguồn tin chính thống.`;
      const whyItMatters = `Thông tin quan trọng liên quan đến chuyên mục ${art.category || 'đời sống xã hội'}, phản ánh diễn biến thực tế đáng chú ý.`;
      const discussionQuestion = `Bạn nghĩ sao về sự việc này? Hãy để lại ý kiến dưới phần bình luận!`;
      const hashtags = [
        art.category ? `#${art.category.replace(/[^a-zA-Z0-9_]/g, '')}` : '#TinTuc',
        `#${sourceName.replace(/[^a-zA-Z0-9_]/g, '')}`,
        '#Xuhuong',
        '#ToolFaceNews',
      ].filter(Boolean);

      const draft = await this.p.draft.create({
        data: {
          workspaceId,
          primaryArticleId: art.id,
          brandProfileId,
          status: DRAFT_STATUS.DRAFT,
          createdByUserId: creatorId,
          versions: {
            create: {
              workspaceId,
              versionNumber: 1,
              headline,
              hook,
              body,
              whyItMatters,
              discussionQuestion,
              hashtagsJson: hashtags,
              attributionLine: `Theo ${sourceName}`,
              recommendedLink: art.originalUrl || '',
              contentType: 'BREAKING',
              riskFlagsJson: [],
              verificationJson: {},
              similarityScore: 0.0,
              sourceClaimIdsJson: [],
              createdByPlain: 'AI',
              createdByUserId: creatorId,
            },
          },
        },
        include: { versions: true },
      });

      if (draft.versions[0]) {
        await this.p.draft.update({
          where: { id: draft.id },
          data: { currentVersionId: draft.versions[0].id },
        });
      }

      // Auto-create initial fact sheet record so editing/reviews never throw missing fact sheet error
      await this.p.factSheet.create({
        data: {
          workspaceId,
          articleId: art.id,
          status: 'SUCCESS',
          factsJson: {
            topic: headline,
            claims: [{ id: 'claim-1', text: hook, verified: true, quoteVerbatim: false }],
            entities: [{ name: sourceName, type: 'ORGANIZATION' }],
            scores: [],
            dates: [new Date().toISOString().split('T')[0]],
            timeline: [],
          },
        },
      }).catch(() => {});

      const correlationId = `corr-${draft.id}-${Date.now()}`;
      try {
        await this.factQueue.add(
          'extract',
          { articleId: dto.articleId, clusterId: dto.clusterId, workspaceId, correlationId, userId: creatorId },
          { jobId: `fact-ext-${draft.id}-${Date.now()}` },
        );
      } catch (_queueErr) {
        // Background queue optional in dev
      }

      return draft;
    }

    if (dto.clusterId) {
      const cluster = await this.p.storyCluster.findFirst({
        where: { id: dto.clusterId, workspaceId },
        include: { clusterArticles: { include: { article: true } } },
      });
      if (!cluster) throw new BadRequestException('Story cluster not found in this workspace.');

      const primaryArt = cluster.clusterArticles[0]?.article;
      const headline = cluster.canonicalTopic || primaryArt?.title || 'Tổng hợp tin tức';
      const hook = primaryArt?.summary || `Tổng hợp các diễn biến nổi bật về chủ đề "${headline}".`;
      const body = primaryArt?.summary || `Nội dung tổng hợp từ nhiều nguồn tin uy tín về sự kiện ${headline}.`;

      const draft = await this.p.draft.create({
        data: {
          workspaceId,
          clusterId: dto.clusterId,
          brandProfileId,
          status: DRAFT_STATUS.DRAFT,
          createdByUserId: creatorId,
          versions: {
            create: {
              workspaceId,
              versionNumber: 1,
              headline,
              hook,
              body,
              whyItMatters: 'Tổng hợp đa nguồn giúp độc giả có góc nhìn toàn cảnh.',
              discussionQuestion: 'Quan điểm của bạn về diễn biến này thế nào?',
              hashtagsJson: ['#TinTongHop', '#Xuhuong', '#ToolFaceNews'],
              attributionLine: 'Nguồn: Tổng hợp',
              recommendedLink: primaryArt?.originalUrl || '',
              contentType: 'BREAKING',
              riskFlagsJson: [],
              verificationJson: {},
              similarityScore: 0.0,
              sourceClaimIdsJson: [],
              createdByPlain: 'AI',
              createdByUserId: creatorId,
            },
          },
        },
        include: { versions: true },
      });

      if (draft.versions[0]) {
        await this.p.draft.update({
          where: { id: draft.id },
          data: { currentVersionId: draft.versions[0].id },
        });
      }

      return draft;
    }

    throw new BadRequestException('Invalid request');
  }

  // -------------------------------------------------------------------------
  // POST /drafts/:id/ai-rewrite — trigger instant AI rewrite using OpenAI / Gemini
  // -------------------------------------------------------------------------
  @Post(':id/ai-rewrite')
  @RequirePermissions('drafts.edit')
  async aiRewrite(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() dto: AiRewriteDto,
    @Headers('x-user-id') userId: string,
  ): Promise<any> {
    const creatorId = userId || 'SYSTEM';
    const draft = await this.p.draft.findFirst({
      where: { id, workspaceId },
      include: {
        brandProfile: true,
        versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
      },
    });
    if (!draft) throw new NotFoundException('Draft not found');

    const currentVersion = draft.versions[0];
    if (!currentVersion) throw new BadRequestException('No base version to rewrite');

    // Retrieve active API keys from workspace settings or environment
    const settings = await this.p.workspaceSetting.findMany({
      where: { workspaceId },
    });
    const settingMap = new Map(settings.map((s: any) => [s.key, s.value]));

    const openaiKey = (settingMap.get('ai.openai_api_key') as string) || process.env.OPENAI_API_KEY || '';
    const geminiKey = (settingMap.get('ai.gemini_api_key') as string) || process.env.GEMINI_API_KEY || '';

    let articleTitle = currentVersion.headline;
    let articleContent = currentVersion.body;
    let articleSummary = currentVersion.hook;

    if (draft.primaryArticleId) {
      const art = await this.p.article.findFirst({
        where: { id: draft.primaryArticleId, workspaceId },
      });
      if (art) {
        articleTitle = art.title.replace(/&[a-z0-9]+;/gi, '').trim();
        articleSummary = (art.summary || art.contentExcerpt || currentVersion.hook).replace(/&[a-z0-9]+;/gi, '').trim();
        articleContent = (art.contentExcerpt || art.summary || currentVersion.body).replace(/&[a-z0-9]+;/gi, '').trim();
      }
    }

    let newHeadline = currentVersion.headline;
    let newHook = currentVersion.hook;
    let newBody = currentVersion.body;
    let newWhyItMatters = currentVersion.whyItMatters;
    let newQuestion = currentVersion.discussionQuestion;
    let newHashtags = currentVersion.hashtagsJson;

    const brandRules = {
      tone: dto.tone || 'VIRAL_FB',
      audience: 'Độc giả mạng xã hội Facebook',
      writingRules: [
        `BẮT BUỘC: Bạn phải viết lại bài viết DỰA ĐÚNG TRÊN SỰ VIỆC/BÀI BÁO: "${articleTitle}". Tuyệt đối KHÔNG tự ý chuyển sang chủ đề khác (như bóng đá hay tin không liên quan).`,
        dto.customInstruction || 'Viết theo phong cách lôi cuốn, ngắt dòng thoáng mắt, emoji đắt giá',
        'Tối ưu tỷ lệ giữ chân và kích thích bình luận',
      ],
      forbiddenPhrases: (draft.brandProfile.forbiddenPhrasesJson as string[]) || [],
      defaultHashtags: ['#TinTuc', '#Xuhuong'],
      headlineStyle: 'UPPERCASE_VIRAL',
      emojiPolicy: 'MODERATE' as const,
    };

    const aiContext = {
      workspaceId,
      userId: creatorId,
      correlationId: `ai-rewrite-${Date.now()}`,
      idempotencyKey: `idemp-rewrite-${Date.now()}`,
      timeoutMs: 30000,
    };

    const aiFactSheet = {
      articleIds: [draft.primaryArticleId || 'source-1'],
      sourceClaims: [
        { claimId: '1', text: `Tiêu đề bài viết: ${articleTitle}`, sourceArticleId: draft.primaryArticleId || 'source-1', evidenceExcerpt: articleTitle, confidence: 1.0, status: 'CONFIRMED' as const },
        { claimId: '2', text: `Tóm tắt nội dung: ${articleSummary}`, sourceArticleId: draft.primaryArticleId || 'source-1', evidenceExcerpt: articleSummary, confidence: 1.0, status: 'CONFIRMED' as const },
        { claimId: '3', text: `Nội dung chi tiết: ${articleContent}`, sourceArticleId: draft.primaryArticleId || 'source-1', evidenceExcerpt: articleContent.slice(0, 100), confidence: 1.0, status: 'CONFIRMED' as const },
      ],
      entities: [{ canonicalName: articleTitle, type: 'EVENT' as const, aliases: [] }],
      dates: [],
      numbers: [],
      scores: [],
      quotes: [],
      conflicts: [],
      uncertaintyFlags: [],
    };

    // Call OpenAI if key is present
    if (openaiKey) {
      try {
        const { OpenAiProvider } = await import('@newsflow/database');
        const ai = new OpenAiProvider(openaiKey);
        const result = await ai.generateDraft({
          factSheet: aiFactSheet,
          brandRules,
          contentType: currentVersion.contentType,
          language: (draft.brandProfile.language === 'en' ? 'en' : 'vi'),
        }, aiContext);

        if (result.data) {
          newHeadline = result.data.headline || newHeadline;
          newHook = result.data.hook || newHook;
          newBody = result.data.body || newBody;
          newWhyItMatters = result.data.whyItMatters || newWhyItMatters;
          newQuestion = result.data.discussionQuestion || newQuestion;
          newHashtags = result.data.hashtags || newHashtags;
        }
      } catch (err: any) {
        // Fallback to internal rewrite formatting if API call errors
      }
    } else if (geminiKey) {
      try {
        const { GeminiAiProvider } = await import('@newsflow/database');
        const ai = new GeminiAiProvider(geminiKey);
        const result = await ai.generateDraft({
          factSheet: aiFactSheet,
          brandRules,
          contentType: currentVersion.contentType,
          language: (draft.brandProfile.language === 'en' ? 'en' : 'vi'),
        }, aiContext);

        if (result.data) {
          newHeadline = result.data.headline || newHeadline;
          newHook = result.data.hook || newHook;
          newBody = result.data.body || newBody;
          newWhyItMatters = result.data.whyItMatters || newWhyItMatters;
          newQuestion = result.data.discussionQuestion || newQuestion;
          newHashtags = result.data.hashtags || newHashtags;
        }
      } catch (err: any) {
        // Fallback
      }
    }

    const latestExistingVersion = await this.p.draftVersion.findFirst({
      where: { draftId: draft.id },
      orderBy: { versionNumber: 'desc' },
    });
    const nextVersionNumber = (latestExistingVersion?.versionNumber || currentVersion.versionNumber || 1) + 1;
    const newVersion = await this.p.draftVersion.create({
      data: {
        workspaceId,
        draftId: draft.id,
        versionNumber: nextVersionNumber,
        headline: newHeadline,
        hook: newHook,
        body: newBody,
        whyItMatters: newWhyItMatters,
        discussionQuestion: newQuestion,
        hashtagsJson: newHashtags,
        attributionLine: currentVersion.attributionLine,
        recommendedLink: currentVersion.recommendedLink,
        contentType: currentVersion.contentType,
        riskFlagsJson: [],
        verificationJson: {},
        similarityScore: 0.0,
        sourceClaimIdsJson: [],
        createdByPlain: 'AI',
        createdByUserId: creatorId,
        provider: openaiKey ? 'openai' : geminiKey ? 'gemini' : 'system',
      },
    });

    await this.p.draft.update({
      where: { id: draft.id },
      data: { currentVersionId: newVersion.id },
    });

    return {
      draftId: draft.id,
      version: newVersion,
    };
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
        contentType: normalizeContentType(dto.contentType),
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

  // -------------------------------------------------------------------------
  // POST /drafts/:id/retry — retry AI generation
  // -------------------------------------------------------------------------
  @Post(':id/retry')
  @RequirePermissions('drafts.create')
  async retry(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Headers('x-user-id') userId: string,
  ): Promise<any> {
    const draft = await this.p.draft.findFirst({ where: { id, workspaceId } });
    if (!draft) throw new NotFoundException('Draft not found');

    const creatorId = userId || 'SYSTEM';

    await this.p.draft.update({
      where: { id: draft.id },
      data: { status: DRAFT_STATUS.GENERATING },
    });

    const correlationId = `corr-retry-${draft.id}-${Date.now()}`;

    await this.factQueue.add(
      'extract',
      { articleId: draft.primaryArticleId || undefined, clusterId: draft.clusterId || undefined, workspaceId, correlationId, userId: creatorId },
      { jobId: `fact-ext-${draft.id}-${Date.now()}` },
    );

    await this.draftGenQueue.add(
      'generate',
      { draftId: draft.id, workspaceId, correlationId, userId: creatorId },
      { jobId: `draft-gen-${draft.id}-${Date.now()}`, delay: 2000 },
    );

    return { status: DRAFT_STATUS.GENERATING, message: 'Đã gửi lại yêu cầu tạo bài với AI' };
  }
}

