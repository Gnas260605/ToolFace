/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from './common/database.service';
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from './common/auth.guard';
import { GeminiAiProvider, calculateHash } from '@newsflow/database';

type ArticleRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type ClusterStatus = 'ACTIVE' | 'CLOSED' | 'ARCHIVED';

@Controller('workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ArticlesController {
  constructor(private readonly db: DatabaseService) {}

  @Get('articles')
  @RequirePermissions('articles.read')
  async listArticles(
    @Param('workspaceId') workspaceId: string,
    @Query('sourceId') sourceId?: string,
    @Query('category') category?: string,
    @Query('language') language?: string,
    @Query('riskLevel') riskLevel?: string,
    @Query('publishedFrom') publishedFrom?: string,
    @Query('publishedTo') publishedTo?: string,
    @Query('discoveredFrom') discoveredFrom?: string,
    @Query('discoveredTo') discoveredTo?: string,
    @Query('search') search?: string,
    @Query('clusterId') clusterId?: string,
    @Query('archived') archived?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '20',
  ): Promise<any> {
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

    const where: any = {
      workspaceId,
    };

    // Archiving filter: defaults to non-archived
    if (archived === 'true') {
      where.archivedAt = { not: null };
    } else {
      where.archivedAt = null;
    }

    if (sourceId) where.sourceId = sourceId;
    if (category) where.category = category;
    if (language) where.language = language;
    if (riskLevel) where.riskLevel = riskLevel as ArticleRiskLevel;

    // Date filters
    if (publishedFrom || publishedTo) {
      where.publishedAt = {};
      if (publishedFrom) where.publishedAt.gte = new Date(publishedFrom);
      if (publishedTo) where.publishedAt.lte = new Date(publishedTo);
    }

    if (discoveredFrom || discoveredTo) {
      where.discoveredAt = {};
      if (discoveredFrom) where.discoveredAt.gte = new Date(discoveredFrom);
      if (discoveredTo) where.discoveredAt.lte = new Date(discoveredTo);
    }

    // Keyword Search
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Cluster filter
    if (clusterId) {
      where.clusterArticles = {
        some: {
          clusterId,
        },
      };
    }

    const queryOptions: any = {
      take: limitNum + 1,
      where,
      orderBy: { publishedAt: 'desc' },
      include: {
        source: {
          select: {
            name: true,
            attributionName: true,
            domain: true,
            trustLevel: true,
          },
        },
        clusterArticles: {
          include: {
            cluster: true,
          },
        },
      },
    };

    if (cursor) {
      queryOptions.cursor = { id: cursor };
      queryOptions.skip = 1;
    }

    const articles = await this.db.article.findMany(queryOptions);

    let nextCursor: string | undefined;
    if (articles.length > limitNum) {
      const nextItem = articles.pop();
      nextCursor = nextItem?.id;
    }

    return {
      data: articles,
      nextCursor,
    };
  }

  @Get('articles/:articleId')
  @RequirePermissions('articles.read')
  async getArticle(
    @Param('workspaceId') workspaceId: string,
    @Param('articleId') articleId: string,
  ): Promise<any> {
    const article = await this.db.article.findFirst({
      where: { id: articleId, workspaceId },
      include: {
        source: {
          select: {
            name: true,
            attributionName: true,
            domain: true,
            trustLevel: true,
          },
        },
        clusterArticles: {
          include: {
            cluster: {
              include: {
                clusterArticles: {
                  include: {
                    article: {
                      select: {
                        id: true,
                        title: true,
                        canonicalUrl: true,
                        publishedAt: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!article) {
      throw new NotFoundException('ARTICLE_NOT_FOUND');
    }

    return article;
  }

  @Post('articles/:articleId/archive')
  @RequirePermissions('sources.manage') // Archiving action restricted to source.manage roles
  async archiveArticle(
    @Param('workspaceId') workspaceId: string,
    @Param('articleId') articleId: string,
  ): Promise<any> {
    const article = await this.db.article.findFirst({
      where: { id: articleId, workspaceId },
    });

    if (!article) {
      throw new NotFoundException('ARTICLE_NOT_FOUND');
    }

    const updated = await this.db.article.update({
      where: { id: articleId },
      data: {
        archivedAt: new Date(),
      },
    });

    // Audit log archiving
    await this.db.auditLog.create({
      data: {
        workspaceId,
        actorId: 'mock-user-id',
        action: 'article.archived',
        resource: 'article',
        resourceId: articleId,
      },
    });

    return updated;
  }

  @Get('story-clusters')
  @RequirePermissions('articles.read')
  async listStoryClusters(
    @Param('workspaceId') workspaceId: string,
    @Query('category') category?: string,
    @Query('status') status?: ClusterStatus,
  ): Promise<any[]> {
    const where: any = {
      workspaceId,
    };
    if (category) where.category = category;
    if (status) where.status = status;

    return this.db.storyCluster.findMany({
      where,
      orderBy: { lastArticleAt: 'desc' },
      include: {
        _count: {
          select: { clusterArticles: true },
        },
      },
    });
  }

  @Get('story-clusters/:clusterId')
  @RequirePermissions('articles.read')
  async getStoryCluster(
    @Param('workspaceId') workspaceId: string,
    @Param('clusterId') clusterId: string,
  ): Promise<any> {
    const cluster = await this.db.storyCluster.findFirst({
      where: { id: clusterId, workspaceId },
      include: {
        clusterArticles: {
          include: {
            article: {
              include: {
                source: {
                  select: {
                    name: true,
                    domain: true,
                  },
                },
              },
            },
          },
          orderBy: {
            similarityScore: 'desc',
          },
        },
      },
    });

    if (!cluster) {
      throw new NotFoundException('CLUSTER_NOT_FOUND');
    }

    return cluster;
  }

  @Post('articles/score-viral')
  @RequirePermissions('articles.read')
  async scoreBatchViral(
    @Param('workspaceId') workspaceId: string,
    @Body() body?: { limit?: number; articleIds?: string[] }
  ): Promise<any> {
    const limit = body?.limit || 20;
    const where: any = { workspaceId, archivedAt: null };
    if (body?.articleIds && body.articleIds.length > 0) {
      where.id = { in: body.articleIds };
    }

    const articles = await this.db.article.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: limit,
      include: { source: { select: { name: true } } },
    });

    if (articles.length === 0) {
      return { success: true, count: 0, items: [] };
    }

    const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.split(',')[0] : '';
    const gemini = new GeminiAiProvider(apiKey);

    const input = {
      articles: articles.map((a: any) => ({
        id: a.id,
        title: a.title,
        summary: a.summary || a.contentExcerpt,
        sourceName: a.source?.name,
        publishedAt: a.publishedAt,
      })),
    };

    const aiResult = await gemini.scoreViralPotential(input, {
      workspaceId,
      correlationId: `viral-${Date.now()}`,
      idempotencyKey: `viral-${Date.now()}`,
      timeoutMs: 60000,
    });

    // Update in database
    for (const item of aiResult.data) {
      await this.db.article.update({
        where: { id: item.id },
        data: {
          viralScore: item.score,
          viralReason: item.reason,
          viralCategory: item.category,
        },
      });
    }

    // Log AI Usage
    await this.db.aiUsageEvent.create({
      data: {
        workspaceId,
        userId: 'SYSTEM',
        taskType: 'FACT_EXTRACTION',
        provider: 'gemini',
        model: aiResult.model,
        inputTokens: aiResult.inputTokens,
        outputTokens: aiResult.outputTokens,
        estimatedCostMinor: aiResult.estimatedCostMinor,
        requestHash: calculateHash(JSON.stringify(input.articles.map((a: any) => a.id))),
        status: 'SUCCESS',
        durationMs: aiResult.durationMs,
        occurredAt: new Date(),
      },
    });

    return {
      success: true,
      count: aiResult.data.length,
      items: aiResult.data,
    };
  }
}
