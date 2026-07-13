'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** Safely extract a message from an unknown catch value. */
function getErrMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
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
        const err = await res.json();
        throw new Error(err.message || 'Tạo bản nháp thất bại');
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Bản nháp</h1>
          <p className="text-sm text-gray-400 mt-1">Quản lý toàn bộ nội dung editorial đang được tạo và biên tập.</p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-blue-600 text-white text-sm font-semibold shadow-lg hover:from-brand-500 hover:to-blue-500 transition-all disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          {creating ? 'Đang tạo...' : 'Tạo bản nháp mới'}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-900/30 border border-red-700/40 text-red-300 text-sm">{error}</div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterStatus('')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${!filterStatus ? 'bg-brand-600/20 text-brand-400 border-brand-600/40' : 'text-gray-500 border-gray-700/40 hover:text-gray-300'}`}
        >
          Tất cả
        </button>
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${filterStatus === s ? 'bg-brand-600/20 text-brand-400 border-brand-600/40' : 'text-gray-500 border-gray-700/40 hover:text-gray-300'}`}
          >
            {STATUS_CONFIG[s]?.label || s}
          </button>
        ))}
      </div>

      {/* Draft List */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-500 text-sm">Đang tải...</div>
      ) : drafts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-500 text-sm gap-3">
          <svg className="w-10 h-10 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span>Chưa có bản nháp nào{filterStatus && ` với trạng thái "${STATUS_CONFIG[filterStatus]?.label}"`}.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.map((d) => {
            const cfg = STATUS_CONFIG[d.status] || { label: d.status, className: 'bg-gray-800/40 text-gray-400 border-gray-700/20' };
            const latestVersion = d.versions?.[0];
            return (
              <button
                key={d.id}
                onClick={() => router.push(`/app/${workspaceId}/drafts/${d.id}`)}
                className="w-full text-left bg-[#0c1323] border border-gray-800/60 rounded-2xl p-4 hover:border-brand-700/50 transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate leading-tight">
                      {latestVersion?.headline || 'Đang xử lý...'}
                    </p>
                    {latestVersion?.body && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{latestVersion.body}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      {d.brandProfile && (
                        <span className="text-[10px] text-gray-600">{d.brandProfile.name}</span>
                      )}
                      <span className="text-[10px] text-gray-700">{formatRelativeTime(d.updatedAt)}</span>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border shrink-0 ${cfg.className}`}>
                    {cfg.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
