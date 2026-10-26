/**
 * Shared contract between the API (which creates video jobs) and the worker (which runs them).
 * Kept free of Node-only rendering code so the API can import it without FFmpeg.
 */
import { ASPECTS, Aspect, CAPTION_STYLES, CaptionStyle, Quality } from './plan';

export const VIDEO_RENDER_QUEUE = 'video-render';

export type VideoJobName = 'plan' | 'render';

export interface PlanJobData {
  videoJobId: string;
  workspaceId: string;
}

export interface RenderJobData {
  videoJobId: string;
  workspaceId: string;
  kind: Quality;
  /** Plan revision this render is for; stale preview renders are skipped. */
  revision: number;
}

export interface VideoJobOptions {
  noVoice?: boolean;
  noSfx?: boolean;
  captionStyle?: CaptionStyle;
}

export interface VideoOutputRef {
  aspect: Aspect;
  key: string;
  duration: number;
}

/**
 * Idempotent BullMQ job ids: enqueueing the same step twice is a no-op.
 * `attempt` changes only for a manual retry after a failure.
 */
export const planJobId = (videoJobId: string, attempt = 0) => `plan__${videoJobId}__a${attempt}`;
export const renderJobId = (videoJobId: string, kind: Quality, revision: number, attempt = 0) =>
  `render__${videoJobId}__${kind}__r${revision}__a${attempt}`;

/** Retries for transient failures (network, API overload); input errors fail immediately. */
export const VIDEO_JOB_ATTEMPTS = 3;
export const VIDEO_JOB_BACKOFF = { type: 'exponential' as const, delay: 30_000 };

/** Object-storage layout: everything of a job lives under one prefix (easy to delete). */
export const videoJobPrefix = (workspaceId: string, videoJobId: string) =>
  `video-studio/${workspaceId}/${videoJobId}/`;
export const inputImageKey = (
  workspaceId: string,
  videoJobId: string,
  index: number,
  ext: string,
) =>
  `${videoJobPrefix(workspaceId, videoJobId)}input/image-${String(index).padStart(2, '0')}${ext}`;
export const inputMusicKey = (workspaceId: string, videoJobId: string, ext: string) =>
  `${videoJobPrefix(workspaceId, videoJobId)}input/music${ext}`;
export const outputKey = (
  workspaceId: string,
  videoJobId: string,
  kind: Quality,
  revision: number,
  aspect: Aspect,
) =>
  `${videoJobPrefix(workspaceId, videoJobId)}${kind}/r${revision}-${aspect.replace(':', 'x')}.mp4`;

export function parseAspects(raw: unknown): Aspect[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',').map((s) => s.trim())
      : [];
  const aspects = [...new Set(list)].filter((a): a is Aspect => ASPECTS.includes(a as Aspect));
  return aspects.length ? aspects : ['9:16'];
}

export function parseCaptionStyle(raw: unknown): CaptionStyle | undefined {
  return CAPTION_STYLES.includes(raw as CaptionStyle) ? (raw as CaptionStyle) : undefined;
}
