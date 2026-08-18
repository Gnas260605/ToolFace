'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** Safely extract a message from an unknown catch value. */
function getErrMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

async function parseResponseError(res: Response, fallbackMsg: string): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return fallbackMsg;
    const json = JSON.parse(text);
    return json.message || json.error?.message || json.details?.message || fallbackMsg;
  } catch (_e) {
    return fallbackMsg;
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  GENERATING: { label: 'Đang tạo nội dung', className: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30' },
  READY_FOR_REVIEW: { label: 'Sẵn sàng để duyệt', className: 'bg-blue-900/30 text-blue-400 border-blue-700/30' },
  CHANGES_REQUESTED: { label: 'Yêu cầu chỉnh sửa', className: 'bg-orange-900/30 text-orange-400 border-orange-700/30' },
  APPROVED: { label: 'Đã duyệt', className: 'bg-emerald-900/30 text-emerald-400 border-emerald-700/30' },
  ARCHIVED: { label: 'Đã lưu trữ', className: 'bg-gray-800/40 text-gray-500 border-gray-700/20' },
  DRAFT: { label: 'Bản nháp', className: 'bg-gray-800/40 text-gray-400 border-gray-700/20' },
  FACT_CHECK_RUNNING: { label: 'Đang kiểm tra dữ kiện', className: 'bg-purple-900/30 text-purple-400 border-purple-700/30' },
  FACT_CHECK_PASS: { label: 'Kiểm tra đạt', className: 'bg-emerald-900/20 text-emerald-500 border-emerald-700/20' },
  GENERATION_FAILED: { label: 'Tạo thất bại', className: 'bg-rose-900/30 text-rose-400 border-rose-700/30' },
};

interface Draft {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  brandProfile: { name: string } | null;
  versions: { headline: string; body: string }[];
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

export default function DraftsListPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceSlug as string;

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = filterStatus
        ? `${API_BASE}/api/v1/workspaces/${workspaceId}/drafts?status=${filterStatus}`
        : `${API_BASE}/api/v1/workspaces/${workspaceId}/drafts`;
      const res = await fetch(url, {
        headers: { 'x-user-role': 'OWNER', 'x-workspace-id': workspaceId },
      });
      if (!res.ok) throw new Error('Không tải được danh sách bản nháp');
      setDrafts(await res.json());
    } catch (e: unknown) {
      setError(getErrMsg(e));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, filterStatus]);

  useEffect(() => { load(); }, [load]);


  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/drafts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'OWNER',
          'x-workspace-id': workspaceId,
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, 'Tạo bản nháp thất bại');
        throw new Error(msg);
      }
      const draft = await res.json();
      router.push(`/app/${workspaceId}/drafts/${draft.id}`);
    } catch (e: unknown) {
      setError(getErrMsg(e));
      setCreating(false);
    }
  };

  const statuses = ['GENERATING', 'READY_FOR_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'ARCHIVED'];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800/40 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" />
            <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-accent-400 font-display">QUẢN LÝ BIÊN TẬP AI</p>
          </div>
          <h1 className="font-display text-2xl font-extrabold text-zinc-100 tracking-tight flex items-center gap-2">
            Bản nháp Editorial
          </h1>
          <p className="text-xs text-zinc-400 mt-1 font-sans">
            Danh sách toàn bộ kịch bản bài viết đang trong tiến trình tạo, kiểm duyệt và xuất bản.
          </p>
        </div>

        <button
          onClick={handleCreate}
          disabled={creating}
          className="btn-shimmer flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-500 via-teal-500 to-emerald-600 hover:from-accent-400 hover:to-emerald-500 text-white text-xs font-bold shadow-md shadow-accent-950/40 transition-all disabled:opacity-50 font-display self-start sm:self-auto"
        >
          {creating ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Đang tạo bản nháp...</span>
            </>
          ) : (
            <>
              <span>✨</span>
              <span>Tạo bản nháp mới</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-center justify-between shadow-lg">
          <span className="font-medium">⚠️ {error}</span>
          <button onClick={() => setError(null)} className="text-zinc-400 hover:text-zinc-200 font-bold px-2">✕</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-surface-raised/60 border border-zinc-800/50 backdrop-blur-md">
        <button
          onClick={() => setFilterStatus('')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all font-display ${
            !filterStatus
              ? 'bg-accent-500/20 text-accent-300 border border-accent-500/40 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 border border-transparent hover:bg-zinc-800/40'
          }`}
        >
          Tất cả bản nháp
        </button>
        {statuses.map((s) => {
          const isActive = filterStatus === s;
          const cfg = STATUS_CONFIG[s] || { label: s, className: '' };
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all font-sans border ${
                isActive
                  ? 'bg-accent-500/20 text-accent-300 border-accent-500/40 shadow-sm'
                  : 'text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Draft List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-5 rounded-2xl bg-surface-raised/60 border border-zinc-800/40 space-y-2 shimmer">
              <div className="h-5 w-2/3 bg-zinc-800/60 rounded" />
              <div className="h-3 w-1/3 bg-zinc-800/40 rounded" />
            </div>
          ))}
        </div>
      ) : drafts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl bg-surface-raised/40 border border-zinc-800/40 space-y-3">
          <div className="text-3xl">📝</div>
          <h3 className="text-sm font-bold text-zinc-200 font-display">Chưa có bản nháp nào</h3>
          <p className="text-xs text-zinc-500 max-w-sm text-center font-sans">
            {filterStatus
              ? `Không tìm thấy bản nháp nào ở trạng thái "${STATUS_CONFIG[filterStatus]?.label}".`
              : 'Bấm nút "Tạo bản nháp mới" hoặc chọn một bài viết từ "Luồng tin tức" để tạo kịch bản AI.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {drafts.map((d) => {
            const cfg = STATUS_CONFIG[d.status] || { label: d.status, className: 'bg-zinc-800/60 text-zinc-400 border-zinc-700/40' };
            const latestVersion = d.versions?.[0];
            return (
              <div
                key={d.id}
                onClick={() => router.push(`/app/${workspaceId}/drafts/${d.id}`)}
                className="group p-5 rounded-2xl bg-surface-raised border border-zinc-800/60 card-hover transition-all duration-200 cursor-pointer shadow-md flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-zinc-100 group-hover:text-accent-300 transition-colors truncate font-display leading-snug">
                      {latestVersion?.headline || 'Bản nháp đang khởi tạo...'}
                    </p>
                  </div>
                  {latestVersion?.body && (
                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed font-sans font-normal">
                      {latestVersion.body}
                    </p>
                  )}
                  <div className="flex items-center gap-3 pt-1 text-[10px] text-zinc-500 font-mono">
                    {d.brandProfile && (
                      <span className="flex items-center gap-1 text-accent-400/80">
                        🏷️ {d.brandProfile.name}
                      </span>
                    )}
                    <span>⏱️ {formatRelativeTime(d.updatedAt)}</span>
                  </div>
                </div>

                <span className={`px-3 py-1 rounded-full text-[10px] font-bold border shrink-0 font-display ${cfg.className}`}>
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
