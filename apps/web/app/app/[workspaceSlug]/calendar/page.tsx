'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

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
  pageConnection: {
    pageName: string;
    pageId: string;
    status: string;
  } | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  SCHEDULED: { label: 'Đã lên lịch', cls: 'bg-blue-900/30 text-blue-400 border-blue-700/30' },
  DUE: { label: 'Đang thực thi', cls: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30' },
  PUBLISHED: { label: 'Đã đăng', cls: 'bg-emerald-900/30 text-emerald-400 border-emerald-700/30' },
  FAILED: { label: 'Thất bại', cls: 'bg-red-900/30 text-red-400 border-red-700/30' },
  CANCELLED: { label: 'Đã huỷ', cls: 'bg-gray-800 text-gray-400 border-gray-700/30' },
  EXPIRED: { label: 'Hết hạn', cls: 'bg-orange-950/30 text-orange-400 border-orange-700/20' },
};

export default function CalendarPage() {
  const params = useParams();
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
      // Calculate date range based on current view
      let fromDate = new Date(currentDate);
      let toDate = new Date(currentDate);

      if (view === 'MONTH') {
        fromDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        toDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
      } else if (view === 'WEEK') {
        const day = currentDate.getDay();
        const diff = currentDate.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        fromDate = new Date(currentDate.setDate(diff));
        fromDate.setHours(0, 0, 0, 0);
        toDate = new Date(fromDate);
        toDate.setDate(fromDate.getDate() + 6);
        toDate.setHours(23, 59, 59, 999);
      } else {
        // Agenda view: next 30 days
        fromDate = new Date();
        fromDate.setHours(0, 0, 0, 0);
        toDate = new Date();
        toDate.setDate(fromDate.getDate() + 30);
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

  // Perform Reschedule
  const handleRescheduleSubmit = async () => {
    if (!selectedJob) return;
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
            localPublishDateTime: newDateTime,
            timezone: newTimezone,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Thay đổi lịch đăng thất bại');
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

  // Perform Cancel
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
        throw new Error(data.message || 'Huỷ lịch đăng thất bại');
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

  // Month rendering helper
  const renderMonthDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days = [];

    // Empty spaces for previous month days
    const adjustedFirstDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1; // start from Monday
    for (let i = 0; i < adjustedFirstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-32 bg-gray-900/10 border border-gray-800/10"></div>);
    }

    // Days of current month
    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, month, day);
      const isToday = new Date().toDateString() === date.toDateString();

      // Find jobs on this day (local time Asia/Ho_Chi_Minh check)
      const dayJobs = jobs.filter((j) => {
        if (!j.publishAtLocal) return false;
        const jobDate = new Date(j.publishAtLocal);
        return (
          jobDate.getFullYear() === year &&
          jobDate.getMonth() === month &&
          jobDate.getDate() === day
        );
      });

      days.push(
        <div
          key={`day-${day}`}
          className={`h-32 border border-gray-800/30 p-2 flex flex-col justify-between transition-all ${
            isToday ? 'bg-brand-950/20 border-brand-800/60 shadow-inner' : 'bg-[#0a0f1d]/50 hover:bg-[#0c1326]'
          }`}
        >
          <span
            className={`text-xs font-semibold self-end rounded-full w-5 h-5 flex items-center justify-center ${
              isToday ? 'bg-brand-600 text-white font-bold' : 'text-gray-400'
            }`}
          >
            {day}
          </span>
          <div className="flex-1 overflow-y-auto space-y-1 mt-1 scrollbar-thin">
            {dayJobs.map((j) => {
              const cfg = STATUS_LABELS[j.status] || { label: j.status, cls: 'bg-gray-800 text-white' };
              const timeStr = j.publishAtLocal
                ? new Date(j.publishAtLocal).toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '';
              return (
                <button
                  key={j.id}
                  onClick={() => {
                    setSelectedJob(j);
                    setNewDateTime(j.requestedLocalTime || '');
                    setNewTimezone(j.requestedTimezone || 'Asia/Ho_Chi_Minh');
                    setCancelReason('');
                  }}
                  className={`w-full text-left text-[10px] p-1.5 rounded-lg border font-medium truncate flex flex-col leading-tight ${cfg.cls}`}
                >
                  <span className="font-bold text-gray-300">{timeStr}</span>
                  <span className="truncate opacity-90">{j.pageConnection?.pageName || 'Facebook Page'}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    return days;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Lịch xuất bản</h1>
          <p className="text-sm text-gray-400 mt-1 flex items-center gap-1.5">
            <span>Quản lý lịch đăng bài của các kênh liên kết. Múi giờ mặc định:</span>
            <span className="px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 text-xs font-semibold border border-brand-500/20">
              Asia/Ho_Chi_Minh
            </span>
          </p>
        </div>

        {/* View Switches */}
        <div className="flex bg-[#0a0f1d] border border-gray-800/60 p-0.5 rounded-xl self-start">
          {(['MONTH', 'WEEK', 'AGENDA'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                view === v ? 'bg-brand-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {v === 'MONTH' ? 'Tháng' : v === 'WEEK' ? 'Tuần' : 'Danh sách'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-900/20 border border-red-800/50 rounded-xl text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* Filters and Navigation */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-[#0a0f1d]/40 border border-gray-800/30 p-4 rounded-2xl">
        {/* Date Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            className="p-2 rounded-lg border border-gray-800 bg-[#0a0f1d] text-gray-400 hover:text-white"
          >
            &larr;
          </button>
          <button
            onClick={handleToday}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-800 bg-[#0a0f1d] text-gray-300 hover:text-white"
          >
            Hôm nay
          </button>
          <button
            onClick={handleNext}
            className="p-2 rounded-lg border border-gray-800 bg-[#0a0f1d] text-gray-400 hover:text-white"
          >
            &rarr;
          </button>
          <span className="text-sm font-semibold text-white ml-2">
            {view === 'MONTH'
              ? currentDate.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })
              : `Tuần ${currentDate.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' })}`}
          </span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          {/* Channel Filter */}
          <select
            value={selectedPageId}
            onChange={(e) => setSelectedPageId(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-[#0a0f1d] border border-gray-800 text-gray-300 text-xs focus:outline-none"
          >
            <option value="">Tất cả kênh</option>
            {availablePages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.pageName}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-[#0a0f1d] border border-gray-800 text-gray-300 text-xs focus:outline-none"
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Calendar Area */}
      {loading ? (
        <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
          Đang tải lịch phát sóng...
        </div>
      ) : view === 'MONTH' ? (
        <div className="border border-gray-800/40 rounded-2xl overflow-hidden bg-[#080d1a]/20 backdrop-blur-md">
          {/* Days of week header */}
          <div className="grid grid-cols-7 border-b border-gray-800/40 bg-[#0c1224]/50">
            {['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'].map((d) => (
              <div key={d} className="py-2 text-center text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                {d}
              </div>
            ))}
          </div>
          {/* Days Grid */}
          <div className="grid grid-cols-7">{renderMonthDays()}</div>
        </div>
      ) : view === 'WEEK' ? (
        <div className="text-center py-12 text-sm text-gray-500 border border-gray-800/40 rounded-2xl bg-[#080d1a]/20">
          Chế độ Tuần hiển thị danh sách các bài đăng trong tuần hiện tại.
          <div className="max-w-md mx-auto space-y-2 mt-4 text-left">
            {jobs.map((j) => (
              <div key={j.id} className="p-3 rounded-xl border border-gray-800/80 bg-[#0c1324] flex justify-between items-center text-xs">
                <div>
                  <p className="font-bold text-white">{j.publishAtLocal ? new Date(j.publishAtLocal).toLocaleString('vi-VN') : ''}</p>
                  <p className="text-gray-400 mt-0.5">{j.pageConnection?.pageName || 'Facebook'}</p>
                </div>
                <button
                  onClick={() => setSelectedJob(j)}
                  className="px-2.5 py-1 rounded bg-gray-800 text-white font-medium hover:bg-gray-700"
                >
                  Xem chi tiết
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Agenda / List View */
        <div className="space-y-3">
          {jobs.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-500 border border-gray-800/40 rounded-2xl">
              Không có bài đăng nào được lên lịch trong khoảng thời gian này.
            </div>
          ) : (
            jobs.map((j) => {
              const cfg = STATUS_LABELS[j.status] || { label: j.status, cls: 'bg-gray-800 text-white' };
              return (
                <div
                  key={j.id}
                  className="bg-[#0c1323] border border-gray-800/60 hover:border-brand-500/40 p-4 rounded-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-all"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-bold text-white">
                        {j.publishAtLocal ? new Date(j.publishAtLocal).toLocaleString('vi-VN') : ''}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 font-medium">
                      Kênh phát: <span className="text-gray-300">{j.pageConnection?.pageName || 'Không rõ'}</span>
                    </p>
                    <p className="text-[10px] text-gray-600">
                      Phiên bản: v{j.scheduleVersion} · Kiểu: {j.publicationType}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedJob(j);
                      setNewDateTime(j.requestedLocalTime || '');
                      setNewTimezone(j.requestedTimezone || 'Asia/Ho_Chi_Minh');
                      setCancelReason('');
                    }}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 transition-all self-start md:self-center"
                  >
                    Xem & Cấu hình
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Details / Action Dialog */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0a0f1d] border border-gray-800/80 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-800/50 flex justify-between items-center bg-[#0c1224]">
              <h3 className="text-base font-bold text-white">Chi tiết lịch xuất bản</h3>
              <button
                onClick={() => {
                  setSelectedJob(null);
                  setIsRescheduling(false);
                  setIsCancelling(false);
                }}
                className="text-gray-400 hover:text-white text-sm"
              >
                &times;
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {actionError && (
                <div className="p-3 bg-red-900/20 border border-red-800/50 rounded-xl text-red-300 text-xs">
                  {actionError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-gray-500 font-semibold uppercase text-[9px] tracking-wider">Trạng thái</p>
                  <span
                    className={`inline-block mt-1 px-2.5 py-0.5 rounded-full font-semibold border ${
                      STATUS_LABELS[selectedJob.status]?.cls || 'bg-gray-800 text-white'
                    }`}
                  >
                    {STATUS_LABELS[selectedJob.status]?.label || selectedJob.status}
                  </span>
                </div>
                <div>
                  <p className="text-gray-500 font-semibold uppercase text-[9px] tracking-wider">Trang liên kết</p>
                  <p className="text-white font-medium mt-1">{selectedJob.pageConnection?.pageName || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-gray-500 font-semibold uppercase text-[9px] tracking-wider">Thời gian đăng (Local)</p>
                  <p className="text-white font-semibold mt-1">
                    {selectedJob.publishAtLocal ? new Date(selectedJob.publishAtLocal).toLocaleString('vi-VN') : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 font-semibold uppercase text-[9px] tracking-wider">Múi giờ yêu cầu</p>
                  <p className="text-white font-medium mt-1">{selectedJob.requestedTimezone || 'Asia/Ho_Chi_Minh'}</p>
                </div>
              </div>

              {/* Reschedule Section */}
              {isRescheduling ? (
                <div className="p-4 rounded-xl border border-gray-800 bg-gray-900/20 space-y-3">
                  <h4 className="text-xs font-bold text-white">Thay đổi lịch đăng</h4>
                  <div className="space-y-1">
                    <label className="block text-[10px] text-gray-500">Giờ đăng mới (Thời gian local)</label>
                    <input
                      type="datetime-local"
                      value={newDateTime}
                      onChange={(e) => setNewDateTime(e.target.value)}
                      className="w-full bg-[#0a0f1d] border border-gray-800 rounded-lg p-2 text-white text-xs"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleRescheduleSubmit}
                      disabled={submittingAction}
                      className="px-3 py-1.5 rounded-lg bg-brand-600 text-white font-semibold text-xs hover:bg-brand-500 disabled:opacity-50"
                    >
                      Xác nhận
                    </button>
                    <button
                      onClick={() => setIsRescheduling(false)}
                      className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 text-xs hover:bg-gray-700"
                    >
                      Huỷ
                    </button>
                  </div>
                </div>
              ) : isCancelling ? (
                <div className="p-4 rounded-xl border border-red-950/40 bg-red-950/10 space-y-3">
                  <h4 className="text-xs font-bold text-red-400">Huỷ bỏ lịch đăng</h4>
                  <div className="space-y-1">
                    <label className="block text-[10px] text-gray-500">Lý do huỷ bài đăng</label>
                    <textarea
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      rows={2}
                      placeholder="Nhập lý do huỷ..."
                      className="w-full bg-[#0a0f1d] border border-gray-800 rounded-lg p-2 text-white text-xs resize-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancelSubmit}
                      disabled={submittingAction}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold text-xs hover:bg-red-500 disabled:opacity-50"
                    >
                      Xác nhận huỷ lịch
                    </button>
                    <button
                      onClick={() => setIsCancelling(false)}
                      className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 text-xs hover:bg-gray-700"
                    >
                      Quay lại
                    </button>
                  </div>
                </div>
              ) : (
                /* Action switches for SCHEDULED status */
                selectedJob.status === 'SCHEDULED' && (
                  <div className="flex gap-2 pt-2 border-t border-gray-800/40">
                    <button
                      onClick={() => setIsRescheduling(true)}
                      className="flex-1 py-2 text-xs font-bold rounded-xl border border-gray-800 bg-[#0a0f1d] hover:bg-gray-800 text-gray-200"
                    >
                      Dời lịch đăng
                    </button>
                    <button
                      onClick={() => setIsCancelling(true)}
                      className="flex-1 py-2 text-xs font-bold rounded-xl border border-red-800/30 bg-red-950/20 hover:bg-red-950/40 text-red-400"
                    >
                      Huỷ lịch đăng
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
