import { spawnSync } from 'node:child_process';
import { mkdtempSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CancelledError,
  InputValidationError,
  RenderJobData,
  renderPlan as realRenderPlan,
} from '@newsflow/video-studio';
import {
  VideoJobRecord,
  VideoJobRunner,
  isPermanent,
  publicErrorMessage,
} from './common/services/video-job-runner';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

function setup(overrides: Partial<VideoJobRecord> = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'vjr-'));
  const bucket = path.join(root, 'bucket');
  const rows = new Map<string, VideoJobRecord & Record<string, unknown>>();
  const job: VideoJobRecord & Record<string, unknown> = {
    id: 'job-1',
    workspaceId: 'ws-1',
    createdByUserId: 'user-1',
    script: 'Mở đầu thật ấn tượng. Phần giữa có số liệu 50%. Kết thúc kêu gọi mua hàng.',
    request: 'TikTok 15 giây',
    style: 'năng động',
    aspectsJson: ['9:16', '1:1'],
    voice: null,
    optionsJson: { noVoice: true },
    imageKeysJson: ['ws-1/job-1/input/image-00.png', 'ws-1/job-1/input/image-01.png'],
    musicKey: null,
    planJson: null,
    planRevision: 0,
    status: 'QUEUED',
    cancelRequested: false,
    deletedAt: null,
    attempts: 0,
    ...overrides,
  };
  rows.set(job.id, job);
  const enqueued: RenderJobData[] = [];
  const usage: unknown[] = [];
  const runner = new VideoJobRunner({
    repo: {
      find: async (id) => (rows.has(id) ? { ...rows.get(id)! } : null),
      update: async (id, data) => {
        const row = rows.get(id)!;
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && 'increment' in (v as object)) {
            row[k] = ((row[k] as number) ?? 0) + (v as { increment: number }).increment;
          } else row[k] = v;
        }
      },
      isCancelRequested: async (id) => rows.get(id)!.cancelRequested,
    },
    storage: {
      getToFile: async (key, file) => {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.copyFile(path.join(bucket, key), file);
      },
      putFile: async (key, file) => {
        await fs.mkdir(path.dirname(path.join(bucket, key)), { recursive: true });
        await fs.copyFile(file, path.join(bucket, key));
      },
    },
    hooks: {
      checkAiQuota: async () => ({ allowed: true }),
      recordUsage: async (_j, u) => {
        usage.push(u);
      },
      enqueueRender: async (d) => {
        enqueued.push(d);
      },
      log: () => undefined,
    },
    workRoot: path.join(root, 'work'),
    cacheDir: path.join(root, 'cache'),
    cacheMaxBytes: 500 * 1024 * 1024,
    cancelPollMs: 50,
  });
  return { root, bucket, rows, job, runner, enqueued, usage };
}

async function putImages(bucket: string, keys: string[]) {
  const colors = ['red', 'blue', 'green'];
  for (let i = 0; i < keys.length; i++) {
    const file = path.join(bucket, keys[i]);
    await fs.mkdir(path.dirname(file), { recursive: true });
    spawnSync('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `color=${colors[i % 3]}:s=320x240`,
      '-frames:v',
      '1',
      file,
    ]);
  }
}

describe('VideoJobRunner', () => {
  it('classifies errors for retries and user-facing messages', () => {
    expect(isPermanent(new InputValidationError('bad'))).toBe(true);
    expect(isPermanent(new CancelledError())).toBe(true);
    expect(isPermanent(new Error('ECONNRESET'))).toBe(false);
    expect(publicErrorMessage(new InputValidationError('Ảnh quá lớn'))).toBe('Ảnh quá lớn');
    expect(publicErrorMessage(new Error('secret stack sk-ant-123'))).not.toContain('sk-ant');
  });

  it.skipIf(!hasFfmpeg)(
    'plans, renders a preview of the first format, then a final of every format',
    async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const t = setup();
      await putImages(t.bucket, t.job.imageKeysJson as string[]);

      await t.runner.runPlan('job-1');
      let row = t.rows.get('job-1')!;
      expect(row.planRevision).toBe(1);
      expect(row.planJson).toBeTruthy();
      expect(row.status).toBe('RENDERING');
      expect(t.enqueued).toEqual([
        { videoJobId: 'job-1', workspaceId: 'ws-1', kind: 'preview', revision: 1 },
      ]);

      await t.runner.runRender(t.enqueued[0]);
      row = t.rows.get('job-1')!;
      expect(row.status).toBe('READY');
      expect(row.previewRevision).toBe(1);
      const preview = row.previewJson as { aspect: string; key: string }[];
      expect(preview.map((p) => p.aspect)).toEqual(['9:16']);
      const probe = spawnSync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'stream=width,height',
        '-of',
        'csv=p=0',
        path.join(t.bucket, preview[0].key),
      ]);
      expect(probe.stdout.toString().trim().split('\n')[0]).toBe('540,960');

      await t.runner.runRender({
        videoJobId: 'job-1',
        workspaceId: 'ws-1',
        kind: 'final',
        revision: 1,
      });
      row = t.rows.get('job-1')!;
      const outputs = row.outputsJson as { aspect: string; key: string }[];
      expect(outputs.map((o) => o.aspect)).toEqual(['9:16', '1:1']);
      expect(row.attempts).toBe(3);
      // scratch space is cleaned up, the cache is kept
      expect(await fs.readdir(path.join(t.root, 'work'))).toEqual([]);
      expect((await fs.readdir(path.join(t.root, 'cache'))).length).toBeGreaterThan(0);
    },
    120_000,
  );

  it.skipIf(!hasFfmpeg)('skips a stale preview and honours cancel requests', async () => {
    const t = setup({ planJson: { scenes: [{ imageIndex: 0, narration: 'x' }] }, planRevision: 3 });
    await t.runner.runRender({
      videoJobId: 'job-1',
      workspaceId: 'ws-1',
      kind: 'preview',
      revision: 2,
    });
    expect(t.rows.get('job-1')!.status).toBe('QUEUED');

    t.rows.get('job-1')!.cancelRequested = true;
    await t.runner.runRender({
      videoJobId: 'job-1',
      workspaceId: 'ws-1',
      kind: 'preview',
      revision: 3,
    });
    expect(t.rows.get('job-1')!.status).toBe('CANCELLED');
  });

  it.skipIf(!hasFfmpeg)(
    'aborts a running render when cancel is requested',
    async () => {
      const t = setup({
        planJson: {
          scenes: [{ imageIndex: 0, narration: 'một hai ba', minDuration: 20 }],
        },
        planRevision: 1,
      });
      await putImages(t.bucket, t.job.imageKeysJson as string[]);
      const runner = new VideoJobRunner({
        ...(t.runner as unknown as { deps: ConstructorParameters<typeof VideoJobRunner>[0] }).deps,
        cacheDir: path.join(t.root, 'nocache'),
        studio: {
          planVideo: async () => {
            throw new Error('unused');
          },
          renderPlan: (opts) => {
            setTimeout(() => (t.rows.get('job-1')!.cancelRequested = true), 300);
            return realRenderPlan(opts);
          },
        },
      });
      const err = await runner
        .runRender({ videoJobId: 'job-1', workspaceId: 'ws-1', kind: 'final', revision: 1 })
        .catch((e) => e);
      expect(err).toBeInstanceOf(CancelledError);
      await runner.markFailed('job-1', err);
      expect(t.rows.get('job-1')!.status).toBe('CANCELLED');
    },
    60_000,
  );

  it.skipIf(!hasFfmpeg)(
    'fails permanently on invalid inputs and when the AI budget is spent',
    async () => {
      const t = setup();
      await fs.mkdir(path.join(t.bucket, 'ws-1/job-1/input'), { recursive: true });
      for (const k of t.job.imageKeysJson as string[])
        await fs.writeFile(path.join(t.bucket, k), 'not an image');
      const err = await t.runner.runPlan('job-1').catch((e) => e);
      expect(err).toBeInstanceOf(InputValidationError);
      expect(isPermanent(err)).toBe(true);
    },
  );
});
