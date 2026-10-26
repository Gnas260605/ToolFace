'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '../../../../components/ui/button';
import { Badge } from '../../../../components/ui/badge';
import {
  ACTIVE,
  Aspect,
  CAPTION_STYLES,
  STATUS_LABEL,
  VOICES,
  VideoJobSummary,
  errMsg,
  videoApi,
} from './api';

const MAX_IMAGES = 30;
const MAX_IMAGE_MB = 15;
const MAX_SCRIPT = 8000;

const ASPECT_OPTIONS: { id: Aspect; label: string; hint: string }[] = [
  { id: '9:16', label: '9:16 dọc', hint: 'TikTok, Reels, Shorts' },
  { id: '16:9', label: '16:9 ngang', hint: 'YouTube' },
  { id: '1:1', label: '1:1 vuông', hint: 'Feed Facebook' },
];

const STYLE_PRESETS = [
  'Năng động kiểu TikTok, chuyển cảnh nhanh',
  'Điện ảnh, chậm rãi, sang trọng',
  'Bán hàng, rõ giá và lời kêu gọi',
  'Tin tức, nghiêm túc, rõ ràng',
];

function statusVariant(s: VideoJobSummary['status']) {
  if (s === 'READY') return 'success' as const;
  if (s === 'FAILED') return 'danger' as const;
  if (s === 'CANCELLED') return 'neutral' as const;
  return 'info' as const;
}

export default function VideosPage() {
  const params = useParams();
  const router = useRouter();
  const ws = params.workspaceSlug as string;

  const [jobs, setJobs] = useState<VideoJobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // form
  const [images, setImages] = useState<File[]>([]);
  const [music, setMusic] = useState<File | null>(null);
  const [script, setScript] = useState('');
  const [request, setRequest] = useState('');
  const [style, setStyle] = useState('');
  const [aspects, setAspects] = useState<Aspect[]>(['9:16']);
  const [voice, setVoice] = useState('');
  const [captionStyle, setCaptionStyle] = useState('');
  const [noVoice, setNoVoice] = useState(false);
  const [noSfx, setNoSfx] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setJobs(await videoApi.list(ws));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [ws]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh while something is running.
  const anyActive = jobs.some((j) => ACTIVE.includes(j.status));
  useEffect(() => {
    if (!anyActive) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [anyActive, load]);

  const thumbs = useMemo(() => images.map((f) => URL.createObjectURL(f)), [images]);
  useEffect(() => () => thumbs.forEach((u) => URL.revokeObjectURL(u)), [thumbs]);

  const addImages = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list).filter((f) => f.type.startsWith('image/'));
    const tooBig = picked.find((f) => f.size > MAX_IMAGE_MB * 1024 * 1024);
    if (tooBig) {
      setError(`${tooBig.name} lớn hơn ${MAX_IMAGE_MB} MB`);
      return;
    }
    setImages((prev) => [...prev, ...picked].slice(0, MAX_IMAGES));
  };

  const move = (i: number, d: -1 | 1) =>
    setImages((prev) => {
      const next = [...prev];
      const j = i + d;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const toggleAspect = (a: Aspect) =>
    setAspects((prev) =>
      prev.includes(a) ? (prev.length > 1 ? prev.filter((x) => x !== a) : prev) : [...prev, a],
    );

  const canSubmit = images.length > 0 && script.trim().length > 0 && !submitting;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      images.forEach((f) => form.append('images', f));
      if (music) form.append('music', music);
      form.append('script', script);
      if (request.trim()) form.append('request', request);
      if (style.trim()) form.append('style', style);
      form.append('aspects', aspects.join(','));
      if (voice) form.append('voice', voice);
      if (captionStyle) form.append('captionStyle', captionStyle);
      form.append('noVoice', String(noVoice));
      form.append('noSfx', String(noSfx));
      const job = await videoApi.create(ws, form);
      router.push(`/app/${ws}/videos/${job.id}`);
    } catch (err) {
      setError(errMsg(err));
      setSubmitting(false);
    }
  };

  const inputCls =
    'w-full rounded-xl bg-zinc-950/70 border border-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 hover:border-zinc-700 focus:border-accent-500/80 focus:ring-1 focus:ring-accent-500/30 outline-none transition';
  const labelCls = 'block text-xs font-bold text-zinc-400 tracking-wide font-display mb-1.5';

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight font-display">Video Studio</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Tải ảnh lên, dán kịch bản — AI chia cảnh, lồng tiếng, thêm phụ đề và hiệu ứng, xuất video
          sẵn sàng đăng.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="px-4 py-3 rounded-xl bg-rose-950/40 border border-rose-700/40 text-rose-300 text-sm"
        >
          {error}
        </div>
      )}

      <form onSubmit={submit} className="grid lg:grid-cols-5 gap-6">
        {/* Images */}
        <section className="lg:col-span-3 space-y-4 rounded-2xl bg-surface-raised border border-zinc-800/60 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-200 font-display">
              1. Ảnh ({images.length}/{MAX_IMAGES})
            </h2>
            {images.length > 0 && (
              <button
                type="button"
                className="text-xs text-zinc-500 hover:text-zinc-300"
                onClick={() => setImages([])}
              >
                Xoá hết
              </button>
            )}
          </div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addImages(e.dataTransfer.files);
            }}
            onClick={() => fileInput.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
            role="button"
            tabIndex={0}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition ${
              dragOver
                ? 'border-accent-400 bg-accent-500/5'
                : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <span className="text-sm text-zinc-300">Kéo thả ảnh vào đây hoặc bấm để chọn</span>
            <span className="text-xs text-zinc-500">
              JPG, PNG, WebP · tối đa {MAX_IMAGE_MB} MB mỗi ảnh · thứ tự ảnh là gợi ý cho AI
            </span>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
              multiple
              hidden
              onChange={(e) => {
                addImages(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          {images.length > 0 && (
            <ul className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {images.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="group relative rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950"
                >
                  <img src={thumbs[i]} alt={f.name} className="w-full aspect-square object-cover" />
                  <span className="absolute top-1 left-1 px-1.5 rounded bg-black/70 text-[10px] text-zinc-200 font-bold">
                    {i + 1}
                  </span>
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/70 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                    <button
                      type="button"
                      aria-label="Lên trước"
                      className="px-2 py-1 text-xs text-zinc-200"
                      onClick={() => move(i, -1)}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      aria-label="Xoá ảnh"
                      className="px-2 py-1 text-xs text-rose-300"
                      onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                    <button
                      type="button"
                      aria-label="Ra sau"
                      className="px-2 py-1 text-xs text-zinc-200"
                      onClick={() => move(i, 1)}
                    >
                      →
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div>
            <label htmlFor="script" className={labelCls}>
              2. Kịch bản lời đọc ({script.length}/{MAX_SCRIPT})
            </label>
            <textarea
              id="script"
              rows={8}
              maxLength={MAX_SCRIPT}
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Bạn có biết? Mỗi ngày có hàng triệu người lướt TikTok để tìm sản phẩm mới..."
              className={inputCls}
              required
            />
          </div>
        </section>

        {/* Options */}
        <section className="lg:col-span-2 space-y-5 rounded-2xl bg-surface-raised border border-zinc-800/60 p-5">
          <h2 className="text-sm font-bold text-zinc-200 font-display">3. Yêu cầu & phong cách</h2>
          <div>
            <label htmlFor="request" className={labelCls}>
              Yêu cầu
            </label>
            <textarea
              id="request"
              rows={3}
              maxLength={2000}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="Video TikTok 30 giây giới thiệu shop, cuối video kêu gọi nhắn tin"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="style" className={labelCls}>
              Phong cách
            </label>
            <input
              id="style"
              maxLength={500}
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="Để trống: AI tự chọn"
              className={inputCls}
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {STYLE_PRESETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStyle(s)}
                  className={`px-2.5 py-1 rounded-full text-[11px] border transition ${
                    style === s
                      ? 'border-accent-500/60 text-accent-300 bg-accent-500/10'
                      : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <fieldset>
            <legend className={labelCls}>Khung hình</legend>
            <div className="grid grid-cols-3 gap-2">
              {ASPECT_OPTIONS.map((a) => (
                <label
                  key={a.id}
                  className={`cursor-pointer rounded-xl border px-3 py-2 text-center transition ${
                    aspects.includes(a.id)
                      ? 'border-accent-500/60 bg-accent-500/10'
                      : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={aspects.includes(a.id)}
                    onChange={() => toggleAspect(a.id)}
                  />
                  <span className="block text-xs font-bold text-zinc-200">{a.label}</span>
                  <span className="block text-[10px] text-zinc-500">{a.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="voice" className={labelCls}>
                Giọng đọc
              </label>
              <select
                id="voice"
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className={inputCls}
                disabled={noVoice}
              >
                <option value="">AI tự chọn</option>
                {VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="captionStyle" className={labelCls}>
                Phụ đề
              </label>
              <select
                id="captionStyle"
                value={captionStyle}
                onChange={(e) => setCaptionStyle(e.target.value)}
                className={inputCls}
              >
                <option value="">AI tự chọn</option>
                {CAPTION_STYLES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="music" className={labelCls}>
              Nhạc nền (tuỳ chọn)
            </label>
            <input
              id="music"
              type="file"
              accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/ogg,audio/flac"
              onChange={(e) => setMusic(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-zinc-200"
            />
            <p className="text-[11px] text-amber-400/90 mt-1.5">
              ⚠ Chỉ dùng nhạc bạn có quyền sử dụng — nền tảng sẽ tắt kiếm tiền hoặc gỡ video dùng
              nhạc của người khác.
            </p>
          </div>

          <div className="flex flex-col gap-2 text-sm text-zinc-300">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={noVoice}
                onChange={(e) => setNoVoice(e.target.checked)}
              />{' '}
              Không lồng tiếng (chỉ phụ đề)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={noSfx} onChange={(e) => setNoSfx(e.target.checked)} />{' '}
              Tắt hiệu ứng âm thanh
            </label>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-3 text-xs text-amber-200">
            <strong className="font-bold">
              ⚠ Mỗi video tốn 1 lượt gọi Claude API có tính phí
            </strong>{' '}
            (ảnh càng nhiều càng tốn). Sửa kế hoạch và render lại sau đó không tốn thêm lượt gọi AI.
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={submitting}
            disabled={!canSubmit}
          >
            {submitting ? 'Đang tải lên…' : 'Tạo video'}
          </Button>
        </section>
      </form>

      {/* History */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-zinc-200 font-display">Video đã tạo</h2>
        {loading ? (
          <p className="text-sm text-zinc-500">Đang tải…</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-zinc-500">Chưa có video nào.</p>
        ) : (
          <ul className="divide-y divide-zinc-800/60 rounded-2xl border border-zinc-800/60 bg-surface-raised">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link
                  href={`/app/${ws}/videos/${j.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-900/40 transition"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-100 truncate">
                      {j.title || 'Video chưa đặt tên'}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {new Date(j.createdAt).toLocaleString('vi-VN')} · {j.aspects.join(', ')}
                      {j.errorMessage && <span className="text-rose-400"> · {j.errorMessage}</span>}
                    </p>
                  </div>
                  {ACTIVE.includes(j.status) && (
                    <div
                      className="w-24 h-1.5 rounded-full bg-zinc-800 overflow-hidden"
                      aria-label={`${j.progress}%`}
                    >
                      <div
                        className="h-full bg-accent-400 transition-all"
                        style={{ width: `${j.progress}%` }}
                      />
                    </div>
                  )}
                  <Badge variant={statusVariant(j.status)} dot>
                    {STATUS_LABEL[j.status]}
                    {j.status === 'READY' && (j.hasFinal ? ' · bản cuối' : ' · xem trước')}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
