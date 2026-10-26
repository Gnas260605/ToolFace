import { promises as fs } from 'node:fs';
import { FFPROBE, run } from './ffmpeg';

/**
 * Limits for user-supplied inputs. Uploaded files go straight into FFmpeg, so they are checked
 * by content (ffprobe), not by file name, before anything is rendered.
 */
export interface InputLimits {
  maxImages: number;
  maxImageBytes: number;
  /** Longest side in pixels. */
  maxImageSide: number;
  maxMusicBytes: number;
  maxMusicSeconds: number;
  maxScriptChars: number;
}

export const DEFAULT_LIMITS: InputLimits = {
  maxImages: 30,
  maxImageBytes: 15 * 1024 * 1024,
  maxImageSide: 10_000,
  maxMusicBytes: 30 * 1024 * 1024,
  maxMusicSeconds: 15 * 60,
  maxScriptChars: 8_000,
};

export class InputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputValidationError';
  }
}

/** Demuxers FFmpeg reports for still images. Anything else (playlists, concat lists, video) is refused. */
const IMAGE_FORMATS = new Set([
  'image2',
  'png_pipe',
  'jpeg_pipe',
  'webp_pipe',
  'bmp_pipe',
  'tiff_pipe',
  'gif',
  'apng',
]);

const AUDIO_FORMATS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'mov,mp4,m4a,3gp,3g2,mj2']);

interface ProbeResult {
  format?: { format_name?: string; duration?: string };
  streams?: { codec_type?: string; width?: number; height?: number }[];
}

async function probe(file: string): Promise<ProbeResult> {
  const out = await run(
    FFPROBE,
    [
      '-v',
      'error',
      '-protocol_whitelist',
      'file',
      '-show_entries',
      'format=format_name,duration:stream=codec_type,width,height',
      '-of',
      'json',
      file,
    ],
    { timeoutMs: 30_000 },
  );
  return JSON.parse(out) as ProbeResult;
}

/** Messages are in Vietnamese: they are shown to end users as-is. */
export async function validateImage(
  file: string,
  limits: InputLimits = DEFAULT_LIMITS,
  label = 'Ảnh',
): Promise<void> {
  const stat = await fs.stat(file);
  if (stat.size > limits.maxImageBytes) {
    throw new InputValidationError(
      `${label} nặng ${(stat.size / 1048576).toFixed(1)} MB (tối đa ${limits.maxImageBytes / 1048576} MB)`,
    );
  }
  let info: ProbeResult;
  try {
    info = await probe(file);
  } catch {
    throw new InputValidationError(`${label} không đọc được — file có thể bị hỏng`);
  }
  const format = info.format?.format_name ?? '';
  const video = info.streams?.find((s) => s.codec_type === 'video');
  if (!IMAGE_FORMATS.has(format) || !video?.width || !video?.height) {
    throw new InputValidationError(
      `${label} không phải ảnh hợp lệ (chỉ nhận JPG, PNG, WebP, BMP, GIF, TIFF)`,
    );
  }
  if (Math.max(video.width, video.height) > limits.maxImageSide) {
    throw new InputValidationError(
      `${label} có kích thước ${video.width}×${video.height}; cạnh dài nhất tối đa ${limits.maxImageSide}px`,
    );
  }
}

export async function validateAudio(
  file: string,
  limits: InputLimits = DEFAULT_LIMITS,
): Promise<void> {
  const stat = await fs.stat(file);
  if (stat.size > limits.maxMusicBytes) {
    throw new InputValidationError(
      `Nhạc nền nặng ${(stat.size / 1048576).toFixed(1)} MB (tối đa ${limits.maxMusicBytes / 1048576} MB)`,
    );
  }
  let info: ProbeResult;
  try {
    info = await probe(file);
  } catch {
    throw new InputValidationError('Nhạc nền không đọc được — file có thể bị hỏng');
  }
  const format = info.format?.format_name ?? '';
  if (!AUDIO_FORMATS.has(format) || !info.streams?.some((s) => s.codec_type === 'audio')) {
    throw new InputValidationError(
      'Nhạc nền không phải file âm thanh hợp lệ (chỉ nhận MP3, WAV, M4A, OGG, FLAC)',
    );
  }
  const duration = parseFloat(info.format?.duration ?? '0');
  if (duration > limits.maxMusicSeconds) {
    throw new InputValidationError(`Nhạc nền dài quá ${limits.maxMusicSeconds / 60} phút`);
  }
}

export function validateScript(script: string, limits: InputLimits = DEFAULT_LIMITS): void {
  if (script.length > limits.maxScriptChars) {
    throw new InputValidationError(
      `Kịch bản có ${script.length} ký tự (tối đa ${limits.maxScriptChars})`,
    );
  }
}

/** Check every input of a job; throws InputValidationError with a readable message. */
export async function validateInputs(
  input: { images: string[]; script: string; music?: string },
  limits: InputLimits = DEFAULT_LIMITS,
): Promise<void> {
  if (input.images.length === 0) throw new InputValidationError('Cần ít nhất 1 ảnh');
  if (input.images.length > limits.maxImages) {
    throw new InputValidationError(
      `Quá nhiều ảnh: ${input.images.length} (tối đa ${limits.maxImages})`,
    );
  }
  validateScript(input.script, limits);
  for (let i = 0; i < input.images.length; i++) {
    await validateImage(input.images[i], limits, `Ảnh số ${i + 1}`);
  }
  if (input.music) await validateAudio(input.music, limits);
}
