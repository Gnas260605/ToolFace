/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Queue } from 'bullmq';
import { IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { diskStorage } from 'multer';
import { ZodError } from 'zod';
import { ObjectStorage } from '@newsflow/database';
import {
  CAPTION_STYLES,
  DEFAULT_LIMITS,
  EditPlan,
  PlanJobData,
  RenderJobData,
  VIDEO_JOB_ATTEMPTS,
  VIDEO_JOB_BACKOFF,
  VIDEO_RENDER_QUEUE,
  VOICES,
  VideoJobOptions,
  VideoOutputRef,
  inputImageKey,
  inputMusicKey,
  parseAspects,
  parseCaptionStyle,
  parseEditPlan,
  planJobId,
  renderJobId,
  videoJobPrefix,
} from '@newsflow/video-studio';
import { DatabaseService } from './common/database.service';
import {
  JwtAuthGuard,
  PermissionsGuard,
  RequirePermissions,
  RequestWithUser,
} from './common/auth.guard';

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
};
const AUDIO_TYPES: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.m4a',
  'audio/ogg': '.ogg',
  'audio/flac': '.flac',
};
/** Presigned links live long enough to watch and download, short enough not to leak. */
const LINK_TTL_SECONDS = 2 * 60 * 60;

class CreateVideoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(DEFAULT_LIMITS.maxScriptChars)
  script!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  request?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  style?: string;

  /** "9:16,16:9" */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  aspects?: string;

  @IsOptional()
  @IsIn([...VOICES, ''])
  voice?: string;

  @IsOptional()
  @IsIn([...CAPTION_STYLES, ''])
  captionStyle?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  noVoice?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  noSfx?: string;
}

class UpdatePlanDto {
  @IsObject()
  plan!: Record<string, unknown>;
}

class RenderDto {
  @IsIn(['preview', 'final'])
  kind!: 'preview' | 'final';
}

type UploadedVideoFiles = { images?: Express.Multer.File[]; music?: Express.Multer.File[] };

@Controller('workspaces/:workspaceId/videos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VideoStudioController {
  private readonly storage = new ObjectStorage();

  constructor(
    private readonly db: DatabaseService,
    @InjectQueue(VIDEO_RENDER_QUEUE) private readonly queue: Queue,
  ) {}

  private get p(): any {
    return this.db;
  }

  /** Create a job from uploaded images (+ optional music) and start planning. */
  @Post()
  @RequirePermissions('ai.generate')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'images', maxCount: DEFAULT_LIMITS.maxImages },
        { name: 'music', maxCount: 1 },
      ],
      {
        storage: diskStorage({ destination: os.tmpdir() }),
        limits: { fileSize: DEFAULT_LIMITS.maxMusicBytes, files: DEFAULT_LIMITS.maxImages + 1 },
      },
    ),
  )
  async create(
    @Param('workspaceId') workspaceId: string,
    @Req() req: RequestWithUser,
    @Body() dto: CreateVideoDto,
    @UploadedFiles() files: UploadedVideoFiles,
  ): Promise<any> {
    const images = files?.images ?? [];
    const music = files?.music?.[0];
    const temp = [...images, ...(music ? [music] : [])].map((f) => f.path);
    try {
      if (images.length === 0) throw new BadRequestException('Cần ít nhất 1 ảnh');
      for (const img of images) {
        if (!IMAGE_TYPES[img.mimetype]) {
          throw new BadRequestException(`${img.originalname}: chỉ nhận JPG, PNG, WebP, GIF, BMP`);
        }
        if (img.size > DEFAULT_LIMITS.maxImageBytes) {
          throw new BadRequestException(
            `${img.originalname}: ảnh tối đa ${DEFAULT_LIMITS.maxImageBytes / 1048576} MB`,
          );
        }
      }
      if (music && !AUDIO_TYPES[music.mimetype]) {
        throw new BadRequestException(`${music.originalname}: chỉ nhận MP3, WAV, M4A, OGG, FLAC`);
      }

      const id = randomUUID();
      // The worker re-checks every file by content (ffprobe) before rendering.
      const imageKeys: string[] = [];
      for (let i = 0; i < images.length; i++) {
        const key = inputImageKey(workspaceId, id, i, IMAGE_TYPES[images[i].mimetype]);
        await this.storage.putFile(key, images[i].path, images[i].mimetype);
        imageKeys.push(key);
      }
      let musicKey: string | null = null;
      if (music) {
        musicKey = inputMusicKey(workspaceId, id, AUDIO_TYPES[music.mimetype]);
        await this.storage.putFile(musicKey, music.path, music.mimetype);
      }

      const options: VideoJobOptions = {
        noVoice: dto.noVoice === 'true',
        noSfx: dto.noSfx === 'true',
        captionStyle: parseCaptionStyle(dto.captionStyle),
      };
      const job = await this.p.videoJob.create({
        data: {
          id,
          workspaceId,
          createdByUserId: req.user?.id ?? 'unknown',
          script: dto.script.trim(),
          request: dto.request?.trim() || null,
          style: dto.style?.trim() || null,
          aspectsJson: parseAspects(dto.aspects),
          voice: dto.voice || null,
          optionsJson: options,
          imageKeysJson: imageKeys,
          musicKey,
          status: 'QUEUED',
          stage: 'queued',
        },
      });
      await this.enqueuePlan(workspaceId, id, 0);
      return this.toDetail(job);
    } finally {
      await Promise.all(temp.map((t) => fs.rm(t, { force: true })));
    }
  }

  @Get()
  @RequirePermissions('drafts.read')
  async list(@Param('workspaceId') workspaceId: string): Promise<any> {
    const jobs = await this.p.videoJob.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        status: true,
        stage: true,
        progress: true,
        renderKind: true,
        errorMessage: true,
        aspectsJson: true,
        planRevision: true,
        previewRevision: true,
        outputsRevision: true,
        createdAt: true,
        updatedAt: true,
        script: true,
      },
    });
    return jobs.map((j: any) => ({
      id: j.id,
      title: j.title || j.script.slice(0, 60),
      status: j.status,
      stage: j.stage,
      progress: j.progress,
      renderKind: j.renderKind,
      errorMessage: j.errorMessage,
      aspects: j.aspectsJson,
      hasPreview: j.previewRevision != null,
      hasFinal: j.outputsRevision != null,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    }));
  }

  @Get(':id')
  @RequirePermissions('drafts.read')
  async get(
    @Param('workspaceId') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<any> {
    return this.toDetail(await this.find(workspaceId, id));
  }

  /** Save an edited plan; a new preview is rendered for it. */
  @Put(':id/plan')
  @RequirePermissions('ai.generate')
  async updatePlan(
    @Param('workspaceId') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanDto,
  ): Promise<any> {
    const job = await this.find(workspaceId, id);
    if (!job.planJson) throw new ConflictException('Video chưa có kế hoạch dựng để sửa');
    const imageCount = (job.imageKeysJson as string[]).length;
    let plan: EditPlan;
    try {
      plan = parseEditPlan(dto.plan, imageCount);
    } catch (err) {
      if (err instanceof ZodError) {
        const first = err.issues[0];
        throw new BadRequestException(
          `Kế hoạch không hợp lệ: ${first.path.join('.')} — ${first.message}`,
        );
      }
      throw new BadRequestException((err as Error).message);
    }
    const revision = job.planRevision + 1;
    const updated = await this.p.videoJob.update({
      where: { id },
      data: {
        planJson: plan,
        title: plan.title,
        planRevision: revision,
        status: 'RENDERING',
        renderKind: 'preview',
        stage: 'queued',
        progress: 0,
        errorMessage: null,
        cancelRequested: false,
      },
    });
    await this.enqueueRender(
      { videoJobId: id, workspaceId, kind: 'preview', revision },
      job.attempts,
    );
    return this.toDetail(updated);
  }

  /** Render a preview again or the final video for the current plan. */
  @Post(':id/render')
  @RequirePermissions('ai.generate')
  @HttpCode(202)
  async render(
    @Param('workspaceId') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenderDto,
  ): Promise<any> {
    const job = await this.find(workspaceId, id);
    if (!job.planJson) throw new ConflictException('Video chưa có kế hoạch dựng');
    if (
      dto.kind === 'final' &&
      job.outputsRevision === job.planRevision &&
      job.status === 'READY'
    ) {
      return this.toDetail(job); // already rendered for this plan
    }
    const updated = await this.p.videoJob.update({
      where: { id },
      data: {
        status: 'RENDERING',
        renderKind: dto.kind,
        stage: 'queued',
        progress: 0,
        errorMessage: null,
        cancelRequested: false,
      },
    });
    await this.enqueueRender(
      { videoJobId: id, workspaceId, kind: dto.kind, revision: job.planRevision },
      job.attempts,
    );
    return this.toDetail(updated);
  }

  /** Start over after a failure or cancel: plans again if there is no plan yet. */
  @Post(':id/retry')
  @RequirePermissions('ai.generate')
  @HttpCode(202)
  async retry(
    @Param('workspaceId') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<any> {
    const job = await this.find(workspaceId, id);
    if (!['FAILED', 'CANCELLED'].includes(job.status)) {
      throw new ConflictException('Chỉ thử lại được video bị lỗi hoặc đã huỷ');
    }
    const updated = await this.p.videoJob.update({
      where: { id },
      data: {
        status: job.planJson ? 'RENDERING' : 'QUEUED',
        renderKind: job.planJson ? job.renderKind ?? 'preview' : null,
        stage: 'queued',
        progress: 0,
        errorMessage: null,
        cancelRequested: false,
      },
    });
    if (job.planJson) {
      await this.enqueueRender(
        {
          videoJobId: id,
          workspaceId,
          kind: job.renderKind === 'final' ? 'final' : 'preview',
          revision: job.planRevision,
        },
        job.attempts + 1,
      );
    } else {
      await this.enqueuePlan(workspaceId, id, job.attempts + 1);
    }
    return this.toDetail(updated);
  }

  @Post(':id/cancel')
  @RequirePermissions('ai.generate')
  @HttpCode(202)
  async cancel(
    @Param('workspaceId') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<any> {
    const job = await this.find(workspaceId, id);
    if (!['QUEUED', 'PLANNING', 'RENDERING'].includes(job.status)) return this.toDetail(job);
    // The worker polls this flag and stops FFmpeg / the AI call within seconds.
    const updated = await this.p.videoJob.update({
      where: { id },
      data: {
        cancelRequested: true,
        ...(job.status === 'QUEUED' ? { status: 'CANCELLED', stage: null } : {}),
      },
    });
    return this.toDetail(updated);
  }

  @Delete(':id')
  @RequirePermissions('ai.generate')
  @HttpCode(204)
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.find(workspaceId, id);
    await this.p.videoJob.update({
      where: { id },
      data: { deletedAt: new Date(), cancelRequested: true },
    });
    await this.storage.deletePrefix(videoJobPrefix(workspaceId, id)).catch(() => 0);
  }

  // ---------------------------------------------------------------------------

  private async find(workspaceId: string, id: string): Promise<any> {
    const job = await this.p.videoJob.findFirst({ where: { id, workspaceId, deletedAt: null } });
    if (!job) throw new NotFoundException('Không tìm thấy video');
    return job;
  }

  private async enqueuePlan(workspaceId: string, videoJobId: string, attempt: number) {
    const data: PlanJobData = { videoJobId, workspaceId };
    await this.queue.add('plan', data, {
      jobId: planJobId(videoJobId, attempt),
      attempts: VIDEO_JOB_ATTEMPTS,
      backoff: VIDEO_JOB_BACKOFF,
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 1000 },
    });
  }

  private async enqueueRender(data: RenderJobData, attempt: number) {
    await this.queue.add('render', data, {
      jobId: renderJobId(data.videoJobId, data.kind, data.revision, attempt),
      attempts: VIDEO_JOB_ATTEMPTS,
      backoff: VIDEO_JOB_BACKOFF,
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 1000 },
    });
  }

  private async links(refs: unknown, title: string): Promise<any[]> {
    if (!Array.isArray(refs)) return [];
    const safe =
      (title || 'video')
        .replace(/[^\p{L}\p{N}\- ]+/gu, '')
        .trim()
        .slice(0, 60) || 'video';
    return Promise.all(
      (refs as VideoOutputRef[]).map(async (r) => ({
        aspect: r.aspect,
        duration: r.duration,
        url: await this.storage.presignGet(r.key, LINK_TTL_SECONDS),
        downloadUrl: await this.storage.presignGet(
          r.key,
          LINK_TTL_SECONDS,
          `${safe}-${r.aspect.replace(':', 'x')}.mp4`,
        ),
      })),
    );
  }

  private async toDetail(job: any): Promise<any> {
    const imageKeys = (job.imageKeysJson as string[]) ?? [];
    const plan = job.planJson as EditPlan | null;
    return {
      id: job.id,
      title: job.title,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      renderKind: job.renderKind,
      errorMessage: job.errorMessage,
      cancelRequested: job.cancelRequested,
      script: job.script,
      request: job.request,
      style: job.style,
      voice: job.voice,
      aspects: job.aspectsJson,
      options: job.optionsJson,
      planRevision: job.planRevision,
      plan,
      post: plan?.post ?? null,
      images: await Promise.all(
        imageKeys.map(async (key, index) => ({
          index,
          url: await this.storage.presignGet(key, LINK_TTL_SECONDS),
        })),
      ),
      hasMusic: !!job.musicKey,
      preview: job.previewJson
        ? { revision: job.previewRevision, items: await this.links(job.previewJson, job.title) }
        : null,
      outputs: job.outputsJson
        ? { revision: job.outputsRevision, items: await this.links(job.outputsJson, job.title) }
        : null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
    };
  }
}
