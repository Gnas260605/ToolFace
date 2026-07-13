/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  IsString,
  IsArray,
  IsBoolean,
  IsOptional,
  IsInt,
  IsIn,
} from 'class-validator';
import { DatabaseService } from './common/database.service';
import { MockAuthGuard, PermissionsGuard, RequirePermissions } from './common/auth.guard';
import { SaasService } from './common/services/saas.service';

// Local enum constants — mirror Prisma schema values
const EMOJI_POLICY_VALUES = ['NONE', 'LOW', 'MODERATE'] as const;
type EmojiPolicyValue = typeof EMOJI_POLICY_VALUES[number];

class CreateBrandProfileDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  tone!: string;

  @IsString()
  audience!: string;

  @IsArray()
  @IsString({ each: true })
  writingRules!: string[];

  @IsArray()
  @IsString({ each: true })
  forbiddenPhrases!: string[];

  @IsArray()
  @IsString({ each: true })
  defaultHashtags!: string[];

  @IsString()
  attributionTemplate!: string;

  @IsString()
  headlineStyle!: string;

  @IsInt()
  @IsOptional()
  defaultPostLength?: number;

  @IsIn(EMOJI_POLICY_VALUES)
  @IsOptional()
  emojiPolicy?: EmojiPolicyValue;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsString()
  @IsOptional()
  createdByUserId?: string;
}

class UpdateBrandProfileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  tone?: string;

  @IsString()
  @IsOptional()
  audience?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  writingRules?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  forbiddenPhrases?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  defaultHashtags?: string[];

  @IsString()
  @IsOptional()
  attributionTemplate?: string;

  @IsString()
  @IsOptional()
  headlineStyle?: string;

  @IsInt()
  @IsOptional()
  defaultPostLength?: number;

  @IsIn(EMOJI_POLICY_VALUES)
  @IsOptional()
  emojiPolicy?: EmojiPolicyValue;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

@Controller('workspaces/:workspaceId/brand-profiles')
@UseGuards(MockAuthGuard, PermissionsGuard)
export class BrandProfilesController {
  constructor(
    private readonly db: DatabaseService,
    private readonly saasService: SaasService,
  ) {}

  /** Cast to `any` so the IDE doesn't need to resolve Prisma's generated types. Runtime is fine. */
  private get p(): any {
    return this.db;
  }

  @Post()
  @RequirePermissions('brand_profiles.manage')
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateBrandProfileDto,
  ): Promise<any> {
    await this.saasService.assertActionAllowed(workspaceId, 'brand_profile.create');

    const existing = await this.p.brandProfile.findFirst({
      where: { workspaceId, name: dto.name, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('Brand profile with this name already exists');
    }

    if (dto.isDefault) {
      await this.p.brandProfile.updateMany({
        where: { workspaceId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.p.brandProfile.create({
      data: {
        workspaceId,
        name: dto.name,
        language: dto.language || 'vi',
        tone: dto.tone,
        audience: dto.audience,
        writingRulesJson: dto.writingRules,
        forbiddenPhrasesJson: dto.forbiddenPhrases,
        defaultHashtagsJson: dto.defaultHashtags,
        attributionTemplate: dto.attributionTemplate,
        headlineStyle: dto.headlineStyle,
        defaultPostLength: dto.defaultPostLength || 300,
        emojiPolicy: dto.emojiPolicy || 'MODERATE',
        isDefault: dto.isDefault || false,
        createdByUserId: dto.createdByUserId || 'SYSTEM',
      },
    });
  }

  @Get()
  @RequirePermissions('brand_profiles.read')
  async findAll(@Param('workspaceId') workspaceId: string): Promise<any> {
    return this.p.brandProfile.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':id')
  @RequirePermissions('brand_profiles.read')
  async findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ): Promise<any> {
    const profile = await this.p.brandProfile.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!profile) throw new NotFoundException('Brand profile not found');
    return profile;
  }

  @Patch(':id')
  @RequirePermissions('brand_profiles.manage')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBrandProfileDto,
  ): Promise<any> {
    const profile = await this.p.brandProfile.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!profile) throw new NotFoundException('Brand profile not found');

    if (dto.name) {
      const dup = await this.p.brandProfile.findFirst({
        where: { workspaceId, name: dto.name, deletedAt: null, id: { not: id } },
      });
      if (dup) throw new ConflictException('Another brand profile with this name already exists');
    }

    if (dto.isDefault) {
      await this.p.brandProfile.updateMany({
        where: { workspaceId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.p.brandProfile.update({
      where: { id },
      data: {
        name: dto.name,
        language: dto.language,
        tone: dto.tone,
        audience: dto.audience,
        writingRulesJson: dto.writingRules ?? undefined,
        forbiddenPhrasesJson: dto.forbiddenPhrases ?? undefined,
        defaultHashtagsJson: dto.defaultHashtags ?? undefined,
        attributionTemplate: dto.attributionTemplate,
        headlineStyle: dto.headlineStyle,
        defaultPostLength: dto.defaultPostLength,
        emojiPolicy: dto.emojiPolicy,
        isDefault: dto.isDefault,
      },
    });
  }

  @Delete(':id')
  @RequirePermissions('brand_profiles.manage')
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ): Promise<any> {
    const profile = await this.p.brandProfile.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!profile) throw new NotFoundException('Brand profile not found');

    return this.p.brandProfile.update({
      where: { id },
      data: { deletedAt: new Date(), isDefault: false },
    });
  }

  @Post(':id/set-default')
  @RequirePermissions('brand_profiles.manage')
  async setDefault(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ): Promise<any> {
    const profile = await this.p.brandProfile.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!profile) throw new NotFoundException('Brand profile not found');

    await this.p.brandProfile.updateMany({
      where: { workspaceId, isDefault: true },
      data: { isDefault: false },
    });

    return this.p.brandProfile.update({
      where: { id },
      data: { isDefault: true },
    });
  }
}
