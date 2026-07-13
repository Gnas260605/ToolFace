/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  IsString,
  IsUrl,
  IsEnum,
  IsInt,
  Min,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DatabaseService } from './common/database.service';
import { MockAuthGuard, PermissionsGuard, RequirePermissions } from './common/auth.guard';
import { SaasService } from './common/services/saas.service';
import {
  safeFetch,
  parseFeed,
  normalizeUrl,
  getDomain,
} from '@newsflow/database';

const SOURCE_TYPE_VALUES = ['OFFICIAL_RSS', 'OFFICIAL_API', 'APPROVED_WEB_PAGE', 'MANUAL_URL'] as const;
const SOURCE_TRUST_LEVEL_VALUES = ['OFFICIAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
const SOURCE_STATUS = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
  AUTO_DISABLED: 'AUTO_DISABLED',
  DELETED: 'DELETED',
} as const;
const SOURCE_HEALTH_STATUS = {
  UNKNOWN: 'UNKNOWN',
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  FAILING: 'FAILING',
  DISABLED: 'DISABLED',
} as const;
type SourceType = (typeof SOURCE_TYPE_VALUES)[number];
type SourceTrustLevel = (typeof SOURCE_TRUST_LEVEL_VALUES)[number];

export class CreateSourceDto {
  @IsString()
  name!: string;

  @IsUrl()
  feedUrl!: string;

  @IsEnum(SOURCE_TYPE_VALUES)
  sourceType!: SourceType;

  @IsString()
  language!: string;

  @IsString()
  country!: string;

  @IsString()
  category!: string;

  @IsEnum(SOURCE_TRUST_LEVEL_VALUES)
  trustLevel!: SourceTrustLevel;

  @IsInt()
  @Min(300)
  pollIntervalSeconds!: number;

  @IsBoolean()
  allowPageExtraction!: boolean;

  @IsString()
  attributionName!: string;

  @IsString()
  @IsOptional()
  licenseNotes?: string;
}

export class UpdateSourceDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsUrl()
  @IsOptional()
  feedUrl?: string;

  @IsEnum(SOURCE_TYPE_VALUES)
  @IsOptional()
  sourceType?: SourceType;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsEnum(SOURCE_TRUST_LEVEL_VALUES)
  @IsOptional()
  trustLevel?: SourceTrustLevel;

  @IsInt()
  @Min(300)
  @IsOptional()
  pollIntervalSeconds?: number;

  @IsBoolean()
  @IsOptional()
  allowPageExtraction?: boolean;

  @IsString()
  @IsOptional()
  attributionName?: string;

  @IsString()
  @IsOptional()
  licenseNotes?: string;
}

export class TestSourceDto {
  @IsUrl()
  feedUrl!: string;
}

@Controller('workspaces/:workspaceId/sources')
@UseGuards(MockAuthGuard, PermissionsGuard)
export class SourcesController {
  constructor(
    private readonly db: DatabaseService,
    private readonly saasService: SaasService,
    @InjectQueue('source-poll') private readonly sourcePollQueue: Queue,
  ) {}

  @Post('test')
  @RequirePermissions('sources.manage')
  @HttpCode(HttpStatus.OK)
  async testArbitraryFeed(
    @Body() body: TestSourceDto,
  ): Promise<any> {
    try {
      const normalized = normalizeUrl(body.feedUrl);
      const res = await safeFetch(normalized, {
        allowHttpInDev: true,
        maxBytes: 5 * 1024 * 1024,
      });

      const parsed = parseFeed(res.body, normalized);
      return {
        valid: true,
        feedType: parsed.feedType,
        title: parsed.title,
        description: parsed.description,
        entryCount: parsed.entries.length,
        sampleEntries: parsed.entries.slice(0, 5).map((e) => ({
          title: e.title,
          url: e.originalUrl,
          publishedAt: e.publishedAt,
        })),
        warnings: [],
      };
    } catch (e: any) {
      const msg = e.message || 'SOURCE_INVALID_FEED';
      throw new BadRequestException(msg);
    }
  }

  @Post()
  @RequirePermissions('sources.manage')
  async createSource(
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateSourceDto,
  ): Promise<any> {
    await this.saasService.assertActionAllowed(workspaceId, 'source.create');

    const normalized = normalizeUrl(body.feedUrl);
    const domain = getDomain(normalized);
    if (!domain) {
      throw new BadRequestException('SOURCE_INVALID_URL');
    }

    // Check duplicate
    const existing = await this.db.source.findFirst({
      where: { workspaceId, feedUrl: normalized, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException('SOURCE_DUPLICATE');
    }

    // Test first (unless explicitly bypassed or disabled - specs require test before save)
    try {
      const testRes = await safeFetch(normalized, {
        allowHttpInDev: true,
        maxBytes: 5 * 1024 * 1024,
      });
      parseFeed(testRes.body, normalized);
    } catch (e: any) {
      throw new BadRequestException(e.message || 'SOURCE_INVALID_FEED');
    }

    const nextPollAt = new Date(Date.now() + body.pollIntervalSeconds * 1000);

    const source = await this.db.source.create({
      data: {
        workspaceId,
        name: body.name,
        domain,
        feedUrl: normalized,
        sourceType: body.sourceType,
        language: body.language,
        country: body.country,
        category: body.category,
        trustLevel: body.trustLevel,
        pollIntervalSeconds: body.pollIntervalSeconds,
        allowPageExtraction: body.allowPageExtraction,
        attributionName: body.attributionName,
        licenseNotes: body.licenseNotes,
        status: SOURCE_STATUS.ACTIVE,
        healthStatus: SOURCE_HEALTH_STATUS.UNKNOWN,
        nextPollAt,
        createdByUserId: 'mock-user-id',
      },
    });

    // Audit creation
    await this.db.auditLog.create({
      data: {
        workspaceId,
        actorId: 'mock-user-id',
        action: 'source.created',
        resource: 'source',
        resourceId: source.id,
        afterValues: source as any,
      },
    });

    return source;
  }

  @Get()
  @RequirePermissions('sources.read')
  async listSources(@Param('workspaceId') workspaceId: string): Promise<any[]> {
    return this.db.source.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':sourceId')
  @RequirePermissions('sources.read')
  async getSource(
    @Param('workspaceId') workspaceId: string,
    @Param('sourceId') sourceId: string,
  ): Promise<any> {
    const source = await this.db.source.findFirst({
      where: { id: sourceId, workspaceId, deletedAt: null },
    });
    if (!source) {
      throw new NotFoundException('SOURCE_NOT_FOUND');
    }
    return source;
  }

  @Patch(':sourceId')
  @RequirePermissions('sources.manage')
  async updateSource(
    @Param('workspaceId') workspaceId: string,
    @Param('sourceId') sourceId: string,
    @Body() body: UpdateSourceDto,
  ): Promise<any> {
    const source = await this.db.source.findFirst({
      where: { id: sourceId, workspaceId, deletedAt: null },
    });
    if (!source) {
      throw new NotFoundException('SOURCE_NOT_FOUND');
    }

    const beforeValues = { ...source };
    const data: any = { ...body };

    if (body.feedUrl) {
      const normalized = normalizeUrl(body.feedUrl);
      const domain = getDomain(normalized);
      if (!domain) {
        throw new BadRequestException('SOURCE_INVALID_URL');
      }
      data.feedUrl = normalized;
      data.domain = domain;

      // Re-test feed URL
      try {
        const testRes = await safeFetch(normalized, {
          allowHttpInDev: true,
          maxBytes: 5 * 1024 * 1024,
        });
        parseFeed(testRes.body, normalized);
      } catch (e: any) {
        throw new BadRequestException(e.message || 'SOURCE_INVALID_FEED');
      }
    }

    if (body.pollIntervalSeconds) {
      data.nextPollAt = new Date(Date.now() + body.pollIntervalSeconds * 1000);
    }

    const updated = await this.db.source.update({
      where: { id: sourceId },
      data,
    });

    // Audit update
    await this.db.auditLog.create({
      data: {
        workspaceId,
        actorId: 'mock-user-id',
        action: 'source.updated',
        resource: 'source',
        resourceId: sourceId,
        beforeValues: beforeValues as any,
        afterValues: updated as any,
      },
    });

    return updated;
  }

  @Delete(':sourceId')
  @RequirePermissions('sources.manage')
  async deleteSource(
    @Param('workspaceId') workspaceId: string,
    @Param('sourceId') sourceId: string,
  ): Promise<any> {
    const source = await this.db.source.findFirst({
      where: { id: sourceId, workspaceId, deletedAt: null },
    });
    if (!source) {
      throw new NotFoundException('SOURCE_NOT_FOUND');
    }

    await this.db.source.update({
      where: { id: sourceId },
      data: {
        deletedAt: new Date(),
        status: SOURCE_STATUS.DELETED,
      },
    });

    // Audit deletion
    await this.db.auditLog.create({
      data: {
        workspaceId,
        actorId: 'mock-user-id',
        action: 'source.deleted',
        resource: 'source',
        resourceId: sourceId,
        beforeValues: source as any,
      },
    });

    return { success: true };
  }

  @Post(':sourceId/test')
  @RequirePermissions('sources.manage')
  @HttpCode(HttpStatus.OK)
  async testExistingSource(
    @Param('workspaceId') workspaceId: string,
    @Param('sourceId') sourceId: string,
  ): Promise<any> {
    const source = await this.db.source.findFirst({
      where: { id: sourceId, workspaceId, deletedAt: null },
    });
    if (!source) {
      throw new NotFoundException('SOURCE_NOT_FOUND');
    }

    try {
      const res = await safeFetch(source.feedUrl, {
        allowHttpInDev: true,
        maxBytes: 5 * 1024 * 1024,
      });

      const parsed = parseFeed(res.body, source.feedUrl);
      return {
        valid: true,
        feedType: parsed.feedType,
        title: parsed.title,
        description: parsed.description,
        entryCount: parsed.entries.length,
        sampleEntries: parsed.entries.slice(0, 5).map((e) => ({
          title: e.title,
          url: e.originalUrl,
          publishedAt: e.publishedAt,
        })),
        warnings: [],
      };
    } catch (e: any) {
      throw new BadRequestException(e.message || 'SOURCE_INVALID_FEED');
    }
  }

  @Post(':sourceId/poll')
  @RequirePermissions('sources.manage')
  @HttpCode(HttpStatus.ACCEPTED)
  async pollSource(
    @Param('workspaceId') workspaceId: string,
    @Param('sourceId') sourceId: string,
  ): Promise<any> {
    const source = await this.db.source.findFirst({
      where: { id: sourceId, workspaceId, deletedAt: null },
    });
    if (!source) {
      throw new NotFoundException('SOURCE_NOT_FOUND');
    }

    if (source.status === SOURCE_STATUS.DISABLED || source.status === SOURCE_STATUS.AUTO_DISABLED) {
      throw new BadRequestException('SOURCE_DISABLED');
    }

    // Trigger manual poll by enqueuing a BullMQ job
    const jobId = `manual-poll-${sourceId}-${Date.now()}`;
    await this.sourcePollQueue.add(
      'poll',
      {
        sourceId,
        workspaceId,
        correlationId: jobId,
        manual: true,
      },
      {
        jobId,
        deduplication: {
          id: jobId,
        },
      },
    );

    // Log audit manual poll
    await this.db.auditLog.create({
      data: {
        workspaceId,
        actorId: 'mock-user-id',
        action: 'source.manual_poll_requested',
        resource: 'source',
        resourceId: sourceId,
      },
    });

    return { success: true, jobId };
  }

  @Post(':sourceId/enable')
  @RequirePermissions('sources.manage')
  async enableSource(
    @Param('workspaceId') workspaceId: string,
    @Param('sourceId') sourceId: string,
  ): Promise<any> {
    const source = await this.db.source.findFirst({
      where: { id: sourceId, workspaceId, deletedAt: null },
    });
    if (!source) {
      throw new NotFoundException('SOURCE_NOT_FOUND');
    }

    const updated = await this.db.source.update({
      where: { id: sourceId },
      data: {
        status: SOURCE_STATUS.ACTIVE,
        healthStatus: SOURCE_HEALTH_STATUS.UNKNOWN,
        consecutiveFailures: 0,
      },
    });

    // Audit enable
    await this.db.auditLog.create({
      data: {
        workspaceId,
        actorId: 'mock-user-id',
        action: 'source.enabled',
        resource: 'source',
        resourceId: sourceId,
      },
    });

    return updated;
  }

  @Post(':sourceId/disable')
  @RequirePermissions('sources.manage')
  async disableSource(
    @Param('workspaceId') workspaceId: string,
    @Param('sourceId') sourceId: string,
  ): Promise<any> {
    const source = await this.db.source.findFirst({
      where: { id: sourceId, workspaceId, deletedAt: null },
    });
    if (!source) {
      throw new NotFoundException('SOURCE_NOT_FOUND');
    }

    const updated = await this.db.source.update({
      where: { id: sourceId },
      data: {
        status: SOURCE_STATUS.DISABLED,
      },
    });

    // Audit disable
    await this.db.auditLog.create({
      data: {
        workspaceId,
        actorId: 'mock-user-id',
        action: 'source.disabled',
        resource: 'source',
        resourceId: sourceId,
      },
    });

    return updated;
  }
}
