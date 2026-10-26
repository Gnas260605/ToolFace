'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '../../../../../components/ui/button';
import { Badge } from '../../../../../components/ui/badge';
import {
  ACTIVE,
  CAPTION_STYLES,
  EditPlan,
  MOTIONS,
  MOTION_LABELS,
  STAGE_LABEL,
  STATUS_LABEL,
  Scene,
  TRANSITIONS,
  TRANSITION_LABELS,
  VOICES,
  VideoJobDetail,
  errMsg,
  formatDuration,
  videoApi,
} from '../api';

const inputCls =
  'w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 hover:border-zinc-700 focus:border-accent-500/80 focus:ring-1 focus:ring-accent-500/30 outline-none transition';
const labelCls = 'block text-[11px] font-bold text-zinc-500 tracking-wide font-display mb-1';

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="text-xs text-accent-300 hover:text-accent-200"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? 'Đã chép' : 'Chép'}
    </button>
  );
}

export default function VideoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ws = params.workspaceSlug as string;
  const id = params.id as string;

  const [job, setJob] = useState<VideoJobDetail | null>(null);
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedRevision = useRef<number>(-1);

  const load = useCallback(async () => {
    try {
      const j = await videoApi.get(ws, id);
      setJob(j);
      // Take the server plan unless the user is in the middle of editing it.
      if (j.plan && (!dirty || j.planRevision !== loadedRevision.current)) {
        if (!dirty) {
          setPlan(j.plan);
          loadedRevision.current = j.planRevision;
        }
      }
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [ws, id, dirty]);

  useEffect(() => {
    load();
  }, [load]);

  const active = job ? ACTIVE.includes(job.status) : false;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [active, load]);

  const act = async (name: string, fn: () => Promise<VideoJobDetail | void>) => {
    setBusy(name);
    setError(null);
    try {
      const j = await fn();
      if (j) setJob(j);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const update = (fn: (p: EditPlan) => EditPlan) => {
    setPlan((p) => (p ? fn(structuredClone(p)) : p));
    setDirty(true);
  };
  const updateScene = (i: number, patch: Partial<Scene>) =>
    update((p) => {
      p.scenes[i] = { ...p.scenes[i], ...patch };
      return p;
    });
  const moveScene = (i: number, d: -1 | 1) =>
    update((p) => {
      const j = i + d;
      if (j < 0 || j >= p.scenes.length) return p;
      [p.scenes[i], p.scenes[j]] = [p.scenes[j], p.scenes[i]];
      return p;
    });
  const removeScene = (i: number) =>
    update((p) => {
      if (p.scenes.length > 1) p.scenes.splice(i, 1);
      return p;
    });
  const duplicateScene = (i: number) =>
    update((p) => {
      p.scenes.splice(i + 1, 0, { ...structuredClone(p.scenes[i]), narration: '' });
      return p;
    });

  const savePlan = () =>
    act('save', async () => {
      if (!plan) return;
      const j = await videoApi.savePlan(ws, id, plan);
      setDirty(false);
      setPlan(j.plan);
      loadedRevision.current = j.planRevision;
      return j;
    });

  if (!job) {
    return <p className="text-sm text-zinc-500">{error ?? 'Đang tải…'}</p>;
  }

  const previewItem = job.preview?.items[0];
  const previewStale = job.preview && job.preview.revision !== job.planRevision;
  const finalReady = job.outputs && job.outputs.revision === job.planRevision;
  const stageText = job.stage ? STAGE_LABEL[job.stage] ?? job.stage : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/app/${ws}/videos`} className="text-xs text-zinc-500 hover:text-zinc-300">
            ← Video Studio
          </Link>
          <h1 className="text-xl font-bold text-white tracking-tight font-display truncate mt-1">
            {plan?.title || job.title || 'Video mới'}
          </h1>
          <div className="flex items-center gap-2 mt-1.5">
            <Badge
              variant={
                job.status === 'READY'
                  ? 'success'
                  : job.status === 'FAILED'
                    ? 'danger'
                    : job.status === 'CANCELLED'
                      ? 'neutral'
                      : 'info'
              }
              dot
            >
              {STATUS_LABEL[job.status]}
            </Badge>
            <span className="text-xs text-zinc-500">
              {job.aspects.join(' · ')} · {job.images.length} ảnh
              {job.hasMusic ? ' · có nhạc nền' : ''}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {active && (
            <Button
              variant="secondary"
              size="sm"
              loading={busy === 'cancel'}
              disabled={job.cancelRequested}
              onClick={() => act('cancel', () => videoApi.cancel(ws, id))}
            >
              {job.cancelRequested ? 'Đang huỷ…' : 'Huỷ'}
            </Button>
          )}
          {(job.status === 'FAILED' || job.status === 'CANCELLED') && (
            <Button
              variant="outline"
              size="sm"
              loading={busy === 'retry'}
              onClick={() => act('retry', () => videoApi.retry(ws, id))}
            >
              Thử lại
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            loading={busy === 'delete'}
            onClick={() => {
              if (!confirm('Xoá video này cùng mọi file đã tạo?')) return;
              act('delete', async () => {
                await videoApi.remove(ws, id);
                router.push(`/app/${ws}/videos`);
              });
            }}
          >
            Xoá
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="px-4 py-3 rounded-xl bg-rose-950/40 border border-rose-700/40 text-rose-300 text-sm"
        >
          {error}
        </div>
      )}
      {job.status === 'FAILED' && job.errorMessage && (
        <div className="px-4 py-3 rounded-xl bg-rose-950/40 border border-rose-700/40 text-rose-300 text-sm">
          {job.errorMessage}
        </div>
      )}

      {active && (
        <div
          className="rounded-2xl border border-zinc-800/60 bg-surface-raised p-5"
          aria-live="polite"
        >
          <div className="flex justify-between text-sm">
            <span className="text-zinc-200">
              {job.renderKind === 'final'
                ? 'Đang xuất bản cuối'
                : job.status === 'PLANNING' || !job.plan
                  ? 'AI đang lên kế hoạch dựng'
                  : 'Đang dựng bản xem trước'}
              {stageText && <span className="text-zinc-500"> — {stageText}</span>}
            </span>
            <span className="text-zinc-400 tabular-nums">{job.progress}%</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent-500 to-emerald-500 transition-all duration-700"
              style={{ width: `${Math.max(3, job.progress)}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-6 items-start">
        {/* Preview + outputs */}
        <aside className="lg:col-span-2 space-y-4 lg:sticky lg:top-20">
          <div className="rounded-2xl border border-zinc-800/60 bg-surface-raised p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-zinc-200 font-display">Xem trước</h2>
              {previewItem && (
                <span className="text-xs text-zinc-500">
                  {formatDuration(previewItem.duration)}
                </span>
              )}
            </div>
            {previewItem ? (
              <>
                <video
                  key={previewItem.url}
                  src={previewItem.url}
                  controls
                  playsInline
                  className="w-full max-h-[70vh] rounded-xl bg-black"
                />
                <p className="text-[11px] text-zinc-500">
                  Bản xem trước nửa độ phân giải. Vùng tô đỏ nhạt là chỗ giao diện TikTok/Reels che
                  — chữ quan trọng phải nằm ngoài vùng đó.
                  {previewStale && (
                    <span className="text-amber-400"> Kế hoạch đã đổi sau bản này.</span>
                  )}
                </p>
              </>
            ) : (
              <div className="aspect-[9/16] max-h-[60vh] mx-auto rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-xs text-zinc-600">
                {active ? 'Đang tạo…' : 'Chưa có bản xem trước'}
              </div>
            )}
            {job.plan && !active && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy === 'preview'}
                  disabled={dirty}
                  onClick={() => act('preview', () => videoApi.render(ws, id, 'preview'))}
                >
                  Dựng lại xem trước
                </Button>
                <Button
                  size="sm"
                  loading={busy === 'final'}
                  disabled={dirty || !!finalReady}
                  onClick={() => act('final', () => videoApi.render(ws, id, 'final'))}
                >
                  {finalReady ? 'Đã xuất bản cuối' : 'Xuất bản cuối (1080p)'}
                </Button>
              </div>
            )}
            {dirty && <p className="text-[11px] text-amber-400">Lưu kế hoạch trước khi dựng.</p>}
          </div>

          {job.outputs && (
            <div className="rounded-2xl border border-emerald-700/40 bg-emerald-950/10 p-4 space-y-3">
              <h2 className="text-sm font-bold text-emerald-300 font-display">Bản cuối</h2>
              {!finalReady && (
                <p className="text-[11px] text-amber-400">Bản này làm từ kế hoạch cũ.</p>
              )}
              <ul className="space-y-2">
                {job.outputs.items.map((o) => (
                  <li key={o.aspect} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-zinc-200">
                      {o.aspect}{' '}
                      <span className="text-zinc-500">· {formatDuration(o.duration)}</span>
                    </span>
                    <span className="flex gap-3">
                      <a
                        href={o.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-zinc-400 hover:text-zinc-200"
                      >
                        Xem
                      </a>
                      <a
                        href={o.downloadUrl}
                        className="text-xs font-bold text-accent-300 hover:text-accent-200"
                      >
                        Tải về
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-amber-300">
                ⚠ Khi đăng, bật nhãn &quot;Nội dung do AI tạo&quot; — TikTok và YouTube yêu cầu với
                giọng đọc / hình ảnh tổng hợp.
              </p>
            </div>
          )}

          {job.post && (job.post.caption || job.post.hashtags.length > 0) && (
            <div className="rounded-2xl border border-zinc-800/60 bg-surface-raised p-4 space-y-3">
              <h2 className="text-sm font-bold text-zinc-200 font-display">Nội dung đăng kèm</h2>
              <div>
                <div className="flex justify-between">
                  <span className={labelCls}>Caption</span>
                  <CopyButton text={`${job.post.caption}\n\n${job.post.hashtags.join(' ')}`} />
                </div>
                <p className="text-sm text-zinc-200 whitespace-pre-line">{job.post.caption}</p>
                <p className="text-sm text-accent-300 mt-1">{job.post.hashtags.join(' ')}</p>
              </div>
              {job.post.youtubeTitle && (
                <div>
                  <div className="flex justify-between">
                    <span className={labelCls}>Tiêu đề YouTube</span>
                    <CopyButton text={job.post.youtubeTitle} />
                  </div>
                  <p className="text-sm text-zinc-200">{job.post.youtubeTitle}</p>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Plan editor */}
        <section className="lg:col-span-3 space-y-4">
          {!plan ? (
            <div className="rounded-2xl border border-zinc-800/60 bg-surface-raised p-6 text-sm text-zinc-500">
              {active ? 'AI đang xem ảnh và chia cảnh…' : 'Chưa có kế hoạch dựng.'}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between sticky top-14 z-10 -mx-1 px-1 py-2 bg-surface-base/90 backdrop-blur">
                <h2 className="text-sm font-bold text-zinc-200 font-display">
                  Kế hoạch dựng · {plan.scenes.length} cảnh
                </h2>
                <div className="flex gap-2">
                  {dirty && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPlan(job.plan);
                        setDirty(false);
                      }}
                    >
                      Bỏ thay đổi
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={!dirty || active}
                    loading={busy === 'save'}
                    onClick={savePlan}
                  >
                    Lưu & dựng xem trước
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800/60 bg-surface-raised p-4 grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className={labelCls} htmlFor="hook">
                    Tiêu đề hook (3 giây đầu)
                  </label>
                  <input
                    id="hook"
                    className={inputCls}
                    value={plan.hookText ?? ''}
                    maxLength={80}
                    onChange={(e) => update((p) => ({ ...p, hookText: e.target.value }))}
                    placeholder="Để trống nếu không cần"
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="voice">
                    Giọng đọc
                  </label>
                  <select
                    id="voice"
                    className={inputCls}
                    value={plan.voice}
                    onChange={(e) => update((p) => ({ ...p, voice: e.target.value }))}
                  >
                    {VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="rate">
                    Tốc độ đọc
                  </label>
                  <select
                    id="rate"
                    className={inputCls}
                    value={plan.speechRate}
                    onChange={(e) => update((p) => ({ ...p, speechRate: e.target.value }))}
                  >
                    {['-10%', '-5%', '+0%', '+5%', '+10%', '+15%', '+20%'].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="cstyle">
                    Kiểu phụ đề
                  </label>
                  <select
                    id="cstyle"
                    className={inputCls}
                    value={plan.captions.style}
                    onChange={(e) =>
                      update((p) => ({ ...p, captions: { ...p.captions, style: e.target.value } }))
                    }
                  >
                    {CAPTION_STYLES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="cpos">
                    Vị trí phụ đề
                  </label>
                  <select
                    id="cpos"
                    className={inputCls}
                    value={plan.captions.position}
                    onChange={(e) =>
                      update((p) => ({
                        ...p,
                        captions: {
                          ...p.captions,
                          position: e.target.value as EditPlan['captions']['position'],
                        },
                      }))
                    }
                  >
                    <option value="bottom">Dưới (trên vùng giao diện app)</option>
                    <option value="center">Giữa</option>
                    <option value="top">Trên</option>
                  </select>
                </div>
                <div className="flex items-end gap-3">
                  <div>
                    <label className={labelCls} htmlFor="hl">
                      Màu nhấn
                    </label>
                    <input
                      id="hl"
                      type="color"
                      className="h-9 w-14 rounded bg-transparent"
                      value={plan.captions.highlightColor}
                      onChange={(e) =>
                        update((p) => ({
                          ...p,
                          captions: { ...p.captions, highlightColor: e.target.value.toUpperCase() },
                        }))
                      }
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-zinc-300 pb-2">
                    <input
                      type="checkbox"
                      checked={plan.captions.box}
                      onChange={(e) =>
                        update((p) => ({
                          ...p,
                          captions: { ...p.captions, box: e.target.checked },
                        }))
                      }
                    />{' '}
                    Nền chữ
                  </label>
                  <label className="flex items-center gap-2 text-sm text-zinc-300 pb-2">
                    <input
                      type="checkbox"
                      checked={plan.captions.uppercase}
                      onChange={(e) =>
                        update((p) => ({
                          ...p,
                          captions: { ...p.captions, uppercase: e.target.checked },
                        }))
                      }
                    />{' '}
                    VIẾT HOA
                  </label>
                </div>
                <div className="flex items-end gap-4 pb-2 text-sm text-zinc-300">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={plan.sfx.enabled}
                      onChange={(e) =>
                        update((p) => ({ ...p, sfx: { ...p.sfx, enabled: e.target.checked } }))
                      }
                    />{' '}
                    Hiệu ứng âm thanh
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={!plan.sfx.enabled}
                      checked={plan.sfx.captionPop}
                      onChange={(e) =>
                        update((p) => ({ ...p, sfx: { ...p.sfx, captionPop: e.target.checked } }))
                      }
                    />{' '}
                    Tiếng pop
                  </label>
                </div>
              </div>

              <ol className="space-y-3">
                {plan.scenes.map((s, i) => (
                  <li
                    key={i}
                    className="rounded-2xl border border-zinc-800/60 bg-surface-raised p-4"
                  >
                    <div className="flex gap-4">
                      <div className="w-24 shrink-0 space-y-1.5">
                        <img
                          src={job.images[s.imageIndex]?.url}
                          alt={`Ảnh ${s.imageIndex + 1}`}
                          className="w-24 h-24 rounded-lg object-cover border border-zinc-800"
                        />
                        <select
                          aria-label="Ảnh của cảnh"
                          className={`${inputCls} !py-1 !text-xs`}
                          value={s.imageIndex}
                          onChange={(e) => updateScene(i, { imageIndex: Number(e.target.value) })}
                        >
                          {job.images.map((img) => (
                            <option key={img.index} value={img.index}>
                              Ảnh {img.index + 1}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-zinc-400 font-display">
                            Cảnh {i + 1}
                          </span>
                          <div className="flex gap-1 text-xs">
                            <button
                              type="button"
                              aria-label="Lên"
                              className="px-1.5 text-zinc-500 hover:text-zinc-200"
                              onClick={() => moveScene(i, -1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label="Xuống"
                              className="px-1.5 text-zinc-500 hover:text-zinc-200"
                              onClick={() => moveScene(i, 1)}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="px-1.5 text-zinc-500 hover:text-zinc-200"
                              onClick={() => duplicateScene(i)}
                            >
                              Nhân đôi
                            </button>
                            <button
                              type="button"
                              className="px-1.5 text-rose-400/80 hover:text-rose-300 disabled:opacity-30"
                              disabled={plan.scenes.length <= 1}
                              onClick={() => removeScene(i)}
                            >
                              Xoá
                            </button>
                          </div>
                        </div>
                        <textarea
                          aria-label="Lời đọc"
                          rows={2}
                          className={inputCls}
                          value={s.narration}
                          onChange={(e) => updateScene(i, { narration: e.target.value })}
                          placeholder="Cảnh im lặng (chỉ hình)"
                        />
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className={labelCls}>Chuyển động</label>
                            <select
                              className={`${inputCls} !py-1.5 !text-xs`}
                              value={s.motion}
                              onChange={(e) => updateScene(i, { motion: e.target.value })}
                            >
                              {MOTIONS.map((m) => (
                                <option key={m} value={m}>
                                  {MOTION_LABELS[m]}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={labelCls}>Khung ảnh</label>
                            <select
                              className={`${inputCls} !py-1.5 !text-xs`}
                              value={s.fit}
                              onChange={(e) =>
                                updateScene(i, { fit: e.target.value as Scene['fit'] })
                              }
                            >
                              <option value="cover">Cắt cho đầy</option>
                              <option value="contain_blur">Giữ nguyên + nền mờ</option>
                            </select>
                          </div>
                          <div>
                            <label className={labelCls}>Chuyển sang cảnh sau</label>
                            <select
                              className={`${inputCls} !py-1.5 !text-xs`}
                              value={s.transition}
                              disabled={i === plan.scenes.length - 1}
                              onChange={(e) => updateScene(i, { transition: e.target.value })}
                            >
                              {TRANSITIONS.map((t) => (
                                <option key={t} value={t}>
                                  {TRANSITION_LABELS[t]}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={labelCls}>Tối thiểu (giây)</label>
                            <input
                              type="number"
                              min={0.5}
                              max={30}
                              step={0.5}
                              className={`${inputCls} !py-1.5 !text-xs`}
                              value={s.minDuration}
                              onChange={(e) =>
                                updateScene(i, {
                                  minDuration: Math.min(
                                    30,
                                    Math.max(0.5, Number(e.target.value) || 2.5),
                                  ),
                                })
                              }
                            />
                          </div>
                        </div>
                        <div>
                          <label className={labelCls}>Từ khoá tô màu (cách nhau dấu phẩy)</label>
                          <input
                            className={`${inputCls} !py-1.5 !text-xs`}
                            value={s.emphasis.join(', ')}
                            onChange={(e) =>
                              updateScene(i, {
                                emphasis: e.target.value
                                  .split(',')
                                  .map((x) => x.trim())
                                  .filter(Boolean)
                                  .slice(0, 5),
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
