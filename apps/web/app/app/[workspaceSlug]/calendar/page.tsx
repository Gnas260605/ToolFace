'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface PublishJob {
  id: string;
  draftId: string;
  draftVersionId: string;
  pageConnectionId: string;
  status: string;
  publicationType: string;
  publishAtUtc: string;
  publishAtLocal: string;
  displayTimezone: string;
  requestedTimezone: string;
  requestedLocalTime: string;
  scheduleVersion: number;
  createdAt: string;
  publishedAt?: string;
  headline?: string;
  hook?: string;
  pageConnection: {
    pageName: string;
    pageId: string;
    status: string;
  } | null;
  draft?: {
    title: string;
    status: string;
    versions?: Array<{
      headline?: string;
      hook?: string;
      body?: string;
    }>;
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  PUBLISHED: {
    label: 'Đã xuất bản',
    bg: 'bg-emerald-950/40',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  SCHEDULED: {
    label: 'Đã hẹn giờ',
    bg: 'bg-sky-950/40',
    text: 'text-sky-300',
    border: 'border-sky-500/30',
    dot: 'bg-sky-400',
  },
  QUEUED: {
    label: 'Đang xếp hàng',
    bg: 'bg-amber-950/40',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    dot: 'bg-amber-400',
  },
  DUE: {
    label: 'Đang thực thi',
    bg: 'bg-yellow-950/40',
    text: 'text-yellow-300',
    border: 'border-yellow-500/30',
    dot: 'bg-yellow-400',
  },
  PUBLISHING: {
    label: 'Đang đăng...',
    bg: 'bg-purple-950/40',
    text: 'text-purple-300',
    border: 'border-purple-500/30',
    dot: 'bg-purple-400',
  },
  FAILED: {
    label: 'Thất bại',
    bg: 'bg-rose-950/40',
    text: 'text-rose-300',
    border: 'border-rose-500/30',
    dot: 'bg-rose-400',
  },
  CANCELLED: {
    label: 'Đã hủy',
    bg: 'bg-zinc-900',
    text: 'text-zinc-400',
    border: 'border-zinc-800',
    dot: 'bg-zinc-500',
  },
};

const DAY_NAMES = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];

export default function CalendarPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceSlug = params.workspaceSlug as string;

  const [view, setView] = useState<'MONTH' | 'WEEK' | 'AGENDA'>('MONTH');
  const [jobs, setJobs] = useState<PublishJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<PublishJob | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [availablePages, setAvailablePages] = useState<{ id: string; pageName: string }[]>([]);

  // Time navigation
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Reschedule / Cancel form state
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [newDateTime, setNewDateTime] = useState('');
  const [newTimezone, setNewTimezone] = useState('Asia/Ho_Chi_Minh');
  const [cancelReason, setCancelReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState(false);

  // Load connected pages for filter
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/workspaces/${workspaceSlug}/facebook/pages`, {
      headers: { 'x-user-role': 'OWNER', 'x-workspace-id': workspaceSlug },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAvailablePages(data))
      .catch(() => {});
  }, [workspaceSlug]);

  // Load calendar items
  const loadCalendar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let fromDate = new Date(currentDate);
      let toDate = new Date(currentDate);

      if (view === 'MONTH') {
        fromDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        toDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
      } else if (view === 'WEEK') {
        const day = currentDate.getDay();
        const diff = currentDate.getDate() - day + (day === 0 ? -6 : 1);
        fromDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), diff, 0, 0, 0);
        toDate = new Date(fromDate);
        toDate.setDate(fromDate.getDate() + 6);
        toDate.setHours(23, 59, 59, 999);
      } else {
        fromDate = new Date();
        fromDate.setHours(0, 0, 0, 0);
        toDate = new Date();
        toDate.setDate(fromDate.getDate() + 60);
        toDate.setHours(23, 59, 59, 999);
      }

      const queryParams = new URLSearchParams({
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        timezone: 'Asia/Ho_Chi_Minh',
      });

      if (filterStatus) queryParams.append('status', filterStatus);
      if (selectedPageId) queryParams.append('pageConnectionId', selectedPageId);

      const res = await fetch(
        `${API_BASE}/api/v1/workspaces/${workspaceSlug}/calendar?${queryParams.toString()}`,
        {
          headers: { 'x-user-role': 'OWNER', 'x-workspace-id': workspaceSlug },
        }
      );

      if (!res.ok) throw new Error('Không thể tải lịch xuất bản');
      const data = await res.json();
      setJobs(data.items || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, currentDate, view, filterStatus, selectedPageId]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  // Navigate dates
  const handlePrev = () => {
    const next = new Date(currentDate);
    if (view === 'MONTH') {
      next.setMonth(next.getMonth() - 1);
    } else {
      next.setDate(next.getDate() - 7);
    }
    setCurrentDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (view === 'MONTH') {
      next.setMonth(next.getMonth() + 1);
    } else {
      next.setDate(next.getDate() + 7);
    }
    setCurrentDate(next);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Stats calculation
  const stats = useMemo(() => {
    const total = jobs.length;
    const published = jobs.filter((j) => j.status === 'PUBLISHED').length;
    const scheduled = jobs.filter((j) => j.status === 'SCHEDULED').length;
    const pending = jobs.filter((j) => ['QUEUED', 'DUE', 'PUBLISHING'].includes(j.status)).length;
    return { total, published, scheduled, pending };
  }, [jobs]);

  // Reschedule handler
  const handleRescheduleSubmit = async () => {
    if (!selectedJob || !newDateTime) return;
    setActionError(null);
    setSubmittingAction(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/workspaces/${workspaceSlug}/publish-jobs/${selectedJob.id}/reschedule`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': 'OWNER',
            'x-workspace-id': workspaceSlug,
          },
          body: JSON.stringify({
            newLocalPublishDateTime: newDateTime,
            newTimezone: newTimezone,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Dời lịch đăng thất bại');
      }

      setIsRescheduling(false);
      setSelectedJob(null);
      loadCalendar();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmittingAction(false);
    }
  };

  // Cancel handler
  const handleCancelSubmit = async () => {
    if (!selectedJob) return;
    setActionError(null);
    setSubmittingAction(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/workspaces/${workspaceSlug}/publish-jobs/${selectedJob.id}/cancel`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': 'OWNER',
            'x-workspace-id': workspaceSlug,
          },
          body: JSON.stringify({ reason: cancelReason }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Hủy lịch đăng thất bại');
      }

      setIsCancelling(false);
      setSelectedJob(null);
      loadCalendar();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmittingAction(false);
    }
  };

  // Helper to extract date key for grouping
  const getJobDateKey = (job: PublishJob) => {
    const raw = job.publishAtLocal || job.publishAtUtc || job.publishedAt || job.createdAt;
    if (!raw) return '';
    const d = new Date(raw);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Render Month View
  const renderMonthGrid = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    // Adjust for Monday as 1st day of week
    const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    const cells = [];

    // Prev month padding
    for (let i = adjustedFirstDay - 1; i >= 0; i--) {
      const dayNum = prevMonthTotalDays - i;
      cells.push(
        <div
          key={`prev-${dayNum}`}
          className="min-h-[120px] bg-zinc-950/20 border border-zinc-800/30 p-2 text-zinc-600 opacity-40 select-none"
        >
          <span className="text-xs font-semibold">{dayNum}</span>
        </div>
      );
    }

    // Current month days
    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, month, day);
      const isToday = new Date().toDateString() === date.toDateString();
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      const dayJobs = jobs.filter((j) => getJobDateKey(j) === dateKey);

      cells.push(
        <div
          key={`day-${day}`}
          className={`min-h-[120px] border border-zinc-800/50 p-2 flex flex-col justify-between transition-all group ${
            isToday
              ? 'bg-accent-950/20 border-accent-500/40 shadow-inner'
              : 'bg-[#0e1015]/80 hover:bg-[#13161c]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                isToday
                  ? 'bg-accent-500 text-black shadow-md shadow-accent-500/30'
                  : 'text-zinc-400 group-hover:text-zinc-200'
              }`}
            >
              {day}
            </span>

            {dayJobs.length > 0 ? (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                {dayJobs.length} bài
              </span>
            ) : (
              <button
                onClick={() => router.push(`/app/${workspaceSlug}/drafts`)}
                className="opacity-0 group-hover:opacity-100 text-[10px] text-zinc-500 hover:text-accent-400 transition"
                title="Tạo bài viết mới"
              >
                + Thêm
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 mt-1.5 max-h-[140px] pr-0.5 scrollbar-thin">
            {dayJobs.map((j) => {
              const cfg = STATUS_CONFIG[j.status] || STATUS_CONFIG.PUBLISHED;
              const dateObj = new Date(j.publishAtLocal || j.publishAtUtc || j.publishedAt || j.createdAt);
              const timeStr = dateObj.toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={j.id}
                  onClick={() => {
                    setSelectedJob(j);
                    setNewDateTime(j.requestedLocalTime || '');
                    setNewTimezone(j.requestedTimezone || 'Asia/Ho_Chi_Minh');
                    setCancelReason('');
                  }}
                  className={`w-full text-left p-2 rounded-xl border transition-all cursor-pointer hover:scale-[1.02] shadow-sm ${cfg.bg} ${cfg.border} hover:border-accent-500/50`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[10px] font-mono font-bold text-zinc-300 flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {timeStr}
                    </span>
                    <span className={`text-[9px] font-semibold px-1 py-0.2 rounded ${cfg.text}`}>
                      {cfg.label}
                    </span>
                  </div>

                  <p className="text-[11px] font-medium text-zinc-100 line-clamp-2 leading-snug">
                    {j.headline || j.draft?.title || 'Bài viết Facebook'}
                  </p>

                  <div className="flex items-center justify-between text-[9px] text-zinc-400 mt-1 pt-1 border-t border-zinc-800/40">
                    <span className="truncate max-w-[90px]">
                      {j.pageConnection?.pageName || 'Fanpage'}
                    </span>
                    <span className="text-zinc-500 font-mono">{j.publicationType || 'POST'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return cells;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ── Top Header & Stats ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">📅</span>
            <h1 className="text-2xl font-black text-zinc-100 tracking-tight">Lịch Xuất Bản Nội Dung</h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1 flex items-center gap-2">
            <span>Kế hoạch phân phối bài viết đa kênh Fanpage Facebook. Múi giờ:</span>
            <span className="px-2 py-0.5 rounded-md bg-accent-500/10 text-accent-300 font-mono font-semibold border border-accent-500/20 text-[11px]">
              Asia/Ho_Chi_Minh (GMT+7)
            </span>
          </p>
        </div>

        {/* 4 Stats Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-col">
            <span className="text-[10px] text-zinc-400 font-medium">Tổng bài</span>
            <span className="text-lg font-extrabold text-zinc-100">{stats.total}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex flex-col">
            <span className="text-[10px] text-emerald-400 font-medium">Đã xuất bản</span>
            <span className="text-lg font-extrabold text-emerald-300">{stats.published}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-sky-950/20 border border-sky-500/20 flex flex-col">
            <span className="text-[10px] text-sky-400 font-medium">Đang hẹn giờ</span>
            <span className="text-lg font-extrabold text-sky-300">{stats.scheduled}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/20 flex flex-col">
            <span className="text-[10px] text-amber-400 font-medium">Hàng đợi</span>
            <span className="text-lg font-extrabold text-amber-300">{stats.pending}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-2xl text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-zinc-500 hover:text-zinc-300">✕</button>
        </div>
      )}

      {/* ── Filter & Navigation Bar ── */}
      <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shadow-xl">
        {/* Date Stepper */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl p-0.5 shadow-inner">
            <button
              onClick={handlePrev}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition"
              title="Kỳ trước"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <button
              onClick={handleToday}
              className="px-3 py-1 text-xs font-bold text-zinc-200 hover:text-white transition"
            >
              Hôm nay
            </button>

            <button
              onClick={handleNext}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition"
              title="Kỳ sau"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <h2 className="text-base font-extrabold text-zinc-100 capitalize">
            {currentDate.toLocaleDateString('vi-VN', {
              month: 'long',
              year: 'numeric',
            })}
          </h2>
        </div>

        {/* View Switcher & Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-accent-500"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="PUBLISHED">Đã xuất bản</option>
            <option value="SCHEDULED">Đang hẹn giờ</option>
            <option value="QUEUED">Hàng đợi</option>
            <option value="FAILED">Thất bại</option>
            <option value="CANCELLED">Đã hủy</option>
          </select>

          {/* Page Filter */}
          <select
            value={selectedPageId}
            onChange={(e) => setSelectedPageId(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-accent-500 max-w-[160px] truncate"
          >
            <option value="">Tất cả Fanpage</option>
            {availablePages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.pageName}
              </option>
            ))}
          </select>

          {/* View Mode Buttons */}
          <div className="flex bg-zinc-950 border border-zinc-800 p-0.5 rounded-xl">
            {(['MONTH', 'AGENDA'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  view === v
                    ? 'bg-accent-500 text-black shadow-md shadow-accent-500/20'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {v === 'MONTH' ? 'Lưới Tháng' : 'Danh Sách'}
              </button>
            ))}
          </div>

          <button
            onClick={() => router.push(`/app/${workspaceSlug}/drafts`)}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-accent-600 to-emerald-600 hover:from-accent-500 hover:to-emerald-500 text-white text-xs font-bold shadow-md transition flex items-center gap-1.5"
          >
            <span>+</span>
            <span>Tạo bài mới</span>
          </button>
        </div>
      </div>

      {/* ── Main Content View ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-80 gap-3 text-zinc-500">
          <div className="w-8 h-8 border-2 border-accent-500/30 border-t-accent-500 rounded-full animate-spin" />
          <span className="text-xs">Đang đồng bộ dữ liệu lịch xuất bản...</span>
        </div>
      ) : view === 'MONTH' ? (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 overflow-hidden shadow-2xl">
          {/* Day of week headers */}
          <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-900/60 text-center py-2.5">
            {DAY_NAMES.map((name, i) => (
              <span
                key={name}
                className={`text-xs font-bold tracking-wide ${
                  i >= 5 ? 'text-accent-400' : 'text-zinc-300'
                }`}
              >
                {name}
              </span>
            ))}
          </div>

          {/* Grid Days */}
          <div className="grid grid-cols-7 gap-px bg-zinc-800/30">
            {renderMonthGrid()}
          </div>
        </div>
      ) : (
        /* Agenda / List View */
        <div className="space-y-3">
          {jobs.length === 0 ? (
            <div className="p-12 text-center text-zinc-500 bg-zinc-900/30 border border-zinc-800/50 rounded-2xl">
              <span className="text-3xl block mb-2">📭</span>
              <p className="text-sm font-medium">Chưa có bài viết nào được lên lịch hoặc đăng trong khoảng thời gian này.</p>
              <button
                onClick={() => router.push(`/app/${workspaceSlug}/drafts`)}
                className="mt-4 px-4 py-2 rounded-xl bg-accent-500 text-black text-xs font-bold hover:bg-accent-400 transition"
              >
                Tạo bài viết ngay
              </button>
            </div>
          ) : (
            jobs.map((j) => {
              const cfg = STATUS_CONFIG[j.status] || STATUS_CONFIG.PUBLISHED;
              const dateObj = new Date(j.publishAtLocal || j.publishAtUtc || j.publishedAt || j.createdAt);

              return (
                <div
                  key={j.id}
                  onClick={() => {
                    setSelectedJob(j);
                    setNewDateTime(j.requestedLocalTime || '');
                    setNewTimezone(j.requestedTimezone || 'Asia/Ho_Chi_Minh');
                    setCancelReason('');
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer hover:border-accent-500/50 flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${cfg.bg} ${cfg.border}`}
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.text} ${cfg.border}`}>
                        {cfg.label}
                      </span>
                      <span className="text-xs font-mono text-zinc-400">
                        {dateObj.toLocaleDateString('vi-VN', {
                          weekday: 'short',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-zinc-100">
                      {j.headline || j.draft?.title || 'Bài viết Facebook'}
                    </h3>

                    {j.hook && (
                      <p className="text-xs text-zinc-400 line-clamp-1">
                        {j.hook}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right text-xs">
                      <p className="font-semibold text-zinc-200">{j.pageConnection?.pageName || 'Fanpage'}</p>
                      <p className="text-zinc-500 text-[10px] font-mono">{j.publicationType || 'POST'}</p>
                    </div>
                    <span className="text-zinc-500">&rarr;</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── MODAL CHI TIẾT BÀI ĐĂNG (EVENT DETAIL POPUP) ── */}
      {selectedJob && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedJob(null);
              setIsRescheduling(false);
              setIsCancelling(false);
            }
          }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[99999] flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="w-full max-w-lg rounded-2xl bg-[#121316] border border-zinc-700/80 p-6 shadow-2xl space-y-5 text-left relative overflow-hidden">
            {/* Top Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${STATUS_CONFIG[selectedJob.status]?.dot || 'bg-zinc-400'}`} />
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  Chi Tiết Bài Đăng
                </span>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-zinc-500 hover:text-zinc-300 text-sm p-1"
              >
                ✕
              </button>
            </div>

            {/* Main Details */}
            <div className="space-y-3">
              <h2 className="text-base font-extrabold text-zinc-100 leading-snug">
                {selectedJob.headline || selectedJob.draft?.title || 'Bài viết Facebook'}
              </h2>

              {selectedJob.hook && (
                <p className="text-xs text-zinc-300 italic bg-zinc-900/80 p-3 rounded-xl border border-zinc-800">
                  &ldquo;{selectedJob.hook}&rdquo;
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <span className="text-zinc-500 block text-[10px]">Trạng thái:</span>
                  <span className={`font-bold ${STATUS_CONFIG[selectedJob.status]?.text || 'text-zinc-200'}`}>
                    {STATUS_CONFIG[selectedJob.status]?.label || selectedJob.status}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <span className="text-zinc-500 block text-[10px]">Kênh xuất bản:</span>
                  <span className="font-bold text-zinc-200 truncate block">
                    {selectedJob.pageConnection?.pageName || 'Fanpage'}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 col-span-2">
                  <span className="text-zinc-500 block text-[10px]">Thời gian phân phối:</span>
                  <span className="font-semibold text-accent-300">
                    {new Date(
                      selectedJob.publishAtLocal || selectedJob.publishAtUtc || selectedJob.publishedAt || selectedJob.createdAt
                    ).toLocaleString('vi-VN')} ({selectedJob.displayTimezone || 'Asia/Ho_Chi_Minh'})
                  </span>
                </div>
              </div>
            </div>

            {/* Error in action */}
            {actionError && (
              <div className="p-2.5 bg-rose-950/40 border border-rose-500/40 rounded-xl text-rose-300 text-xs">
                {actionError}
              </div>
            )}

            {/* Reschedule Box */}
            {isRescheduling && (
              <div className="p-4 rounded-xl bg-sky-950/20 border border-sky-500/30 space-y-3">
                <h4 className="text-xs font-bold text-sky-300">Chọn thời điểm hẹn giờ mới</h4>
                <input
                  type="datetime-local"
                  value={newDateTime}
                  onChange={(e) => setNewDateTime(e.target.value)}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 p-2.5 text-xs text-zinc-100"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsRescheduling(false)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleRescheduleSubmit}
                    disabled={submittingAction || !newDateTime}
                    className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {submittingAction ? 'Đang lưu...' : 'Xác nhận Dời lịch'}
                  </button>
                </div>
              </div>
            )}

            {/* Cancel Box */}
            {isCancelling && (
              <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-3">
                <h4 className="text-xs font-bold text-rose-300">Xác nhận hủy lịch đăng bài</h4>
                <input
                  type="text"
                  placeholder="Nhập lý do hủy (tùy chọn)..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 p-2.5 text-xs text-zinc-100"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsCancelling(false)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs"
                  >
                    Quay lại
                  </button>
                  <button
                    onClick={handleCancelSubmit}
                    disabled={submittingAction}
                    className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {submittingAction ? 'Đang hủy...' : 'Xác nhận Hủy lịch'}
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {!isRescheduling && !isCancelling && (
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-zinc-800">
                <button
                  onClick={() => router.push(`/app/${workspaceSlug}/drafts/${selectedJob.draftId}`)}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-400 text-black text-xs font-bold shadow-md transition flex items-center justify-center gap-1.5"
                >
                  <span>✏️</span>
                  <span>Mở Trình Soạn Thảo</span>
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  {['SCHEDULED', 'QUEUED', 'DUE'].includes(selectedJob.status) && (
                    <>
                      <button
                        onClick={() => setIsRescheduling(true)}
                        className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sky-300 text-xs font-semibold transition"
                      >
                        ⏰ Dời lịch
                      </button>
                      <button
                        onClick={() => setIsCancelling(true)}
                        className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-rose-300 text-xs font-semibold transition"
                      >
                        🚫 Hủy lịch
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setSelectedJob(null)}
                    className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
