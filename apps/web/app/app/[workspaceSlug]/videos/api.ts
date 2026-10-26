// Client for the Video Studio API (apps/api/src/video-studio.controller.ts).
// Types mirror packages/video-studio/src/plan.ts; the web app does not import that
// package because it depends on Node-only modules.

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export type Aspect = '9:16' | '16:9' | '1:1';
export type JobStatus = 'QUEUED' | 'PLANNING' | 'RENDERING' | 'READY' | 'FAILED' | 'CANCELLED';

export const MOTIONS = [
  'zoom_in',
  'zoom_out',
  'pan_left',
  'pan_right',
  'pan_up',
  'pan_down',
  'static',
] as const;
export const TRANSITIONS = [
  'cut',
  'fade',
  'dissolve',
  'fadeblack',
  'slideleft',
  'slideright',
  'slideup',
  'slidedown',
  'wipeleft',
  'wiperight',
  'circleopen',
  'smoothleft',
  'smoothup',
  'zoomin',
] as const;
export const VOICES = [
  { id: 'vi-VN-HoaiMyNeural', label: 'Hoài My (nữ)' },
  { id: 'vi-VN-NamMinhNeural', label: 'Nam Minh (nam)' },
] as const;
export const CAPTION_STYLES = [
  { id: 'karaoke', label: 'Karaoke — chữ sáng theo giọng' },
  { id: 'pop', label: 'Pop — cả dòng bật lên' },
  { id: 'plain', label: 'Nhẹ nhàng — mờ dần' },
] as const;

export const MOTION_LABELS: Record<string, string> = {
  zoom_in: 'Phóng to',
  zoom_out: 'Thu nhỏ',
  pan_left: 'Lia trái',
  pan_right: 'Lia phải',
  pan_up: 'Lia lên',
  pan_down: 'Lia xuống',
  static: 'Đứng yên',
};
export const TRANSITION_LABELS: Record<string, string> = {
  cut: 'Cắt',
  fade: 'Mờ dần',
  dissolve: 'Hoà tan',
  fadeblack: 'Qua đen',
  slideleft: 'Trượt trái',
  slideright: 'Trượt phải',
  slideup: 'Trượt lên',
  slidedown: 'Trượt xuống',
  wipeleft: 'Quét trái',
  wiperight: 'Quét phải',
  circleopen: 'Mở tròn',
  smoothleft: 'Mượt trái',
  smoothup: 'Mượt lên',
  zoomin: 'Zoom vào',
};

export interface Scene {
  imageIndex: number;
  narration: string;
  caption?: string;
  motion: string;
  fit: 'cover' | 'contain_blur';
  transition: string;
  minDuration: number;
  emphasis: string[];
}

export interface EditPlan {
  title: string;
  hookText?: string;
  voice: string;
  speechRate: string;
  captions: {
    enabled: boolean;
    style: string;
    box: boolean;
    position: 'bottom' | 'center' | 'top';
    color: string;
    highlightColor: string;
    uppercase: boolean;
    scale: number;
  };
  sfx: { enabled: boolean; volume: number; captionPop: boolean };
  musicVolume: number;
  scenes: Scene[];
  post?: { caption: string; hashtags: string[]; youtubeTitle: string };
}

export interface VideoLink {
  aspect: Aspect;
  duration: number;
  url: string;
  downloadUrl: string;
}

export interface VideoJobSummary {
  id: string;
  title: string;
  status: JobStatus;
  stage: string | null;
  progress: number;
  renderKind: 'preview' | 'final' | null;
  errorMessage: string | null;
  aspects: Aspect[];
  hasPreview: boolean;
  hasFinal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VideoJobDetail extends Omit<VideoJobSummary, 'hasPreview' | 'hasFinal'> {
  cancelRequested: boolean;
  script: string;
  request: string | null;
  style: string | null;
  voice: string | null;
  planRevision: number;
  plan: EditPlan | null;
  post: EditPlan['post'] | null;
  images: { index: number; url: string }[];
  hasMusic: boolean;
  preview: { revision: number; items: VideoLink[] } | null;
  outputs: { revision: number; items: VideoLink[] } | null;
  completedAt: string | null;
}

export const ACTIVE: JobStatus[] = ['QUEUED', 'PLANNING', 'RENDERING'];

export const STATUS_LABEL: Record<JobStatus, string> = {
  QUEUED: 'Đang chờ',
  PLANNING: 'AI đang lên kế hoạch',
  RENDERING: 'Đang dựng video',
  READY: 'Sẵn sàng',
  FAILED: 'Lỗi',
  CANCELLED: 'Đã huỷ',
};

export const STAGE_LABEL: Record<string, string> = {
  queued: 'Đang xếp hàng',
  starting: 'Đang khởi động',
  validating: 'Kiểm tra ảnh và nhạc',
  planning: 'AI xem ảnh và chia cảnh',
  voice: 'Tạo giọng đọc',
  rendering: 'Dựng hình, phụ đề, âm thanh',
  uploading: 'Lưu video',
  retrying: 'Gặp lỗi tạm thời, sắp thử lại',
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function headers(workspaceId: string, json = true): HeadersInit {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    'x-user-role': 'OWNER',
    'x-workspace-id': workspaceId,
  };
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body?.message;
    throw new ApiError(
      Array.isArray(msg) ? msg.join(', ') : msg || `Yêu cầu thất bại (${res.status})`,
      res.status,
    );
  }
  return body as T;
}

const base = (ws: string) => `${API_BASE}/api/v1/workspaces/${encodeURIComponent(ws)}/videos`;

export const videoApi = {
  list: (ws: string) =>
    fetch(base(ws), { headers: headers(ws, false), cache: 'no-store' }).then((r) =>
      handle<VideoJobSummary[]>(r),
    ),
  get: (ws: string, id: string) =>
    fetch(`${base(ws)}/${id}`, { headers: headers(ws, false), cache: 'no-store' }).then((r) =>
      handle<VideoJobDetail>(r),
    ),
  create: (ws: string, form: FormData) =>
    fetch(base(ws), { method: 'POST', headers: headers(ws, false), body: form }).then((r) =>
      handle<VideoJobDetail>(r),
    ),
  savePlan: (ws: string, id: string, plan: EditPlan) =>
    fetch(`${base(ws)}/${id}/plan`, {
      method: 'PUT',
      headers: headers(ws),
      body: JSON.stringify({ plan }),
    }).then((r) => handle<VideoJobDetail>(r)),
  render: (ws: string, id: string, kind: 'preview' | 'final') =>
    fetch(`${base(ws)}/${id}/render`, {
      method: 'POST',
      headers: headers(ws),
      body: JSON.stringify({ kind }),
    }).then((r) => handle<VideoJobDetail>(r)),
  retry: (ws: string, id: string) =>
    fetch(`${base(ws)}/${id}/retry`, { method: 'POST', headers: headers(ws) }).then((r) =>
      handle<VideoJobDetail>(r),
    ),
  cancel: (ws: string, id: string) =>
    fetch(`${base(ws)}/${id}/cancel`, { method: 'POST', headers: headers(ws) }).then((r) =>
      handle<VideoJobDetail>(r),
    ),
  remove: (ws: string, id: string) =>
    fetch(`${base(ws)}/${id}`, { method: 'DELETE', headers: headers(ws, false) }).then((r) =>
      handle<void>(r),
    ),
};

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
