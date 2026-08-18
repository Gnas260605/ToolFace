'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AutoPilotConfig {
  autoPilotEnabled: boolean;
  autoPublishTargetPageId: string | null;
  autoPublishBrandProfileId: string | null;
  autoPublishIntervalMinutes: number;
  autoPublishImmediate: boolean;
  autoPublishMinSafetyScore: number;
  autoPublishPostType: string;
}

interface PageOption {
  pageId: string;
  pageName: string;
  status: string;
}

interface BrandOption {
  id: string;
  name: string;
  toneVoice: string;
  isDefault: boolean;
}

interface AutoJob {
  id: string;
  draftId: string;
  status: string;
  publicationType: string;
  publishAtUtc: string | null;
  createdAt: string;
  publishedAt: string | null;
  lastErrorMessage: string | null;
  pageConnection: { pageName: string } | null;
}

export default function AutoPilotPage() {
  const params = useParams();
  const workspaceSlug = (params.workspaceSlug as string) || 'default-workspace';

  const [config, setConfig] = useState<AutoPilotConfig>({
    autoPilotEnabled: false,
    autoPublishTargetPageId: null,
    autoPublishBrandProfileId: null,
    autoPublishIntervalMinutes: 30,
    autoPublishImmediate: false,
    autoPublishMinSafetyScore: 0.8,
    autoPublishPostType: 'LINK',
  });

  const [availablePages, setAvailablePages] = useState<PageOption[]>([]);
  const [availableBrands, setAvailableBrands] = useState<BrandOption[]>([]);
  const [recentAutoJobs, setRecentAutoJobs] = useState<AutoJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceSlug}/autopilot`, {
        headers: {
          'x-user-role': 'OWNER',
          'x-workspace-id': workspaceSlug,
        },
      });
      if (!res.ok) throw new Error('Không thể tải cấu hình Tự Động Hóa');
      const data = await res.json();
      if (data.config) setConfig(data.config);
      if (data.availablePages) setAvailablePages(data.availablePages);
      if (data.availableBrandProfiles) setAvailableBrands(data.availableBrandProfiles);
      if (data.recentAutoJobs) setRecentAutoJobs(data.recentAutoJobs);
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async (updatedConfig = config) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceSlug}/autopilot`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'OWNER',
          'x-workspace-id': workspaceSlug,
        },
        body: JSON.stringify(updatedConfig),
      });
      if (!res.ok) throw new Error('Lưu cấu hình thất bại');
      setMessage({ type: 'success', text: 'Đã lưu cấu hình Tự Động Hóa 100% thành công!' });
      await loadData();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAutoPilot = async () => {
    const nextState = !config.autoPilotEnabled;
    const nextConfig = { ...config, autoPilotEnabled: nextState };
    setConfig(nextConfig);
    await handleSave(nextConfig);
  };

  const handleTriggerTest = async () => {
    setTriggering(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceSlug}/autopilot/trigger`, {
        method: 'POST',
        headers: {
          'x-user-role': 'OWNER',
          'x-workspace-id': workspaceSlug,
        },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Kích hoạt thử nghiệm thất bại');
      }
      setMessage({ type: 'success', text: data.message });
      await loadData();
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* ─── Header ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-gradient-to-tr from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-purple-400">
                🤖
              </span>
              Hệ Thống Tự Động Hóa 100% (Auto-Pilot)
            </h1>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
                config.autoPilotEnabled
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${config.autoPilotEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
              {config.autoPilotEnabled ? 'ĐANG BẬT TỰ ĐỘNG' : 'ĐANG TẮT'}
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1.5">
            Cào tin mới $\rightarrow$ AI viết lại $\rightarrow$ Thẩm định Fact-check $\rightarrow$ Tự duyệt $\rightarrow$ Xuất bản lên Fanpage hoàn toàn không cần người quản lý.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleTriggerTest}
            disabled={triggering || loading}
            className="px-4 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-200 text-sm font-medium transition active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            <span className={triggering ? 'animate-spin' : ''}>🔄</span>
            Chạy thử nghiệm ngay
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {message && (
        <div
          className={`p-4 rounded-xl text-sm flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-950/40 border border-emerald-800/50 text-emerald-300'
              : 'bg-rose-950/40 border border-rose-800/50 text-rose-300'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-zinc-400 hover:text-white font-bold ml-4">✕</button>
        </div>
      )}

      {/* ─── Master Auto-Pilot Switch Card ─── */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-purple-950/20 border border-zinc-800/80 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              Kích Hoạt Chế Độ Tự Động Toàn Diện
            </h2>
            <p className="text-sm text-zinc-400 max-w-2xl">
              Khi bật chế độ này, mọi bài báo thu thập từ các nguồn tin uy tín sẽ được AI chuyển hóa thành bài viết Facebook độc quyền và tự động xếp lịch xuất bản lên Fanpage đích.
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              checked={config.autoPilotEnabled}
              onChange={handleToggleAutoPilot}
              disabled={saving}
              className="sr-only peer"
            />
            <div className="w-16 h-9 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-7 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-7 after:w-7 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </div>
      </div>

      {/* ─── Detailed Configuration Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Target & Voice */}
        <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-5">
          <h3 className="text-base font-semibold text-white flex items-center gap-2 border-b border-zinc-800 pb-3">
            <span>🎯</span> Kênh Đích & Phong Cách Viết
          </h3>

          {/* Target Page */}
          <div>
            <label className="block text-xs font-semibold uppercase text-zinc-400 mb-2">
              Fanpage Facebook Nhận Bài Tự Động
            </label>
            <select
              value={config.autoPublishTargetPageId || ''}
              onChange={(e) => setConfig({ ...config, autoPublishTargetPageId: e.target.value || null })}
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition"
            >
              <option value="">-- Chọn Fanpage đích --</option>
              {availablePages.map((page) => (
                <option key={page.pageId} value={page.pageId}>
                  {page.pageName} ({page.status === 'ACTIVE' ? 'Đã kết nối' : 'Cần xác thực'})
                </option>
              ))}
            </select>
            {availablePages.length === 0 && (
              <p className="text-xs text-amber-400 mt-1.5">
                ⚠️ Chưa có Fanpage nào được kết nối. Hãy vào mục <strong>Kênh Facebook</strong> để kết nối trước.
              </p>
            )}
          </div>

          {/* Brand Voice */}
          <div>
            <label className="block text-xs font-semibold uppercase text-zinc-400 mb-2">
              Hồ Sơ Phong Cách AI (Brand Voice)
            </label>
            <select
              value={config.autoPublishBrandProfileId || ''}
              onChange={(e) => setConfig({ ...config, autoPublishBrandProfileId: e.target.value || null })}
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition"
            >
              <option value="">-- Sử dụng cấu hình mặc định --</option>
              {availableBrands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name} {brand.isDefault ? '(Mặc định)' : ''} — {brand.toneVoice}
                </option>
              ))}
            </select>
          </div>

          {/* Post Type */}
          <div>
            <label className="block text-xs font-semibold uppercase text-zinc-400 mb-2">
              Định Dạng Bài Đăng Xuất Bản
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setConfig({ ...config, autoPublishPostType: 'COMMENT_LINK' })}
                className={`p-3 rounded-xl border text-left transition ${
                  config.autoPublishPostType === 'COMMENT_LINK'
                    ? 'bg-purple-950/40 border-purple-500/60 text-white shadow-lg shadow-purple-950/50'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                <div className="font-semibold text-xs text-purple-300">💬 Link Dưới Comment</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">Tối ưu Reach, tự động bình luận link gốc</div>
              </button>

              <button
                type="button"
                onClick={() => setConfig({ ...config, autoPublishPostType: 'LINK' })}
                className={`p-3 rounded-xl border text-left transition ${
                  config.autoPublishPostType === 'LINK'
                    ? 'bg-purple-950/40 border-purple-500/60 text-white shadow-lg shadow-purple-950/50'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                <div className="font-semibold text-xs">🔗 Đính Kèm Link Trực Tiếp</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">Hiển thị thẻ xem trước bài báo</div>
              </button>

              <button
                type="button"
                onClick={() => setConfig({ ...config, autoPublishPostType: 'TEXT' })}
                className={`p-3 rounded-xl border text-left transition ${
                  config.autoPublishPostType === 'TEXT'
                    ? 'bg-purple-950/40 border-purple-500/60 text-white shadow-lg shadow-purple-950/50'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                <div className="font-semibold text-xs">📝 Thuần Text / Caption</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">Không kèm link ngoài</div>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Schedule & Guardrails */}
        <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-5">
          <h3 className="text-base font-semibold text-white flex items-center gap-2 border-b border-zinc-800 pb-3">
            <span>⏱️</span> Tần Suất & Tiêu Chuẩn Thẩm Định
          </h3>

          {/* Interval */}
          <div>
            <label className="block text-xs font-semibold uppercase text-zinc-400 mb-2">
              Khoảng Cách Thời Gian Giữa Các Bài Đăng
            </label>
            <select
              value={config.autoPublishIntervalMinutes}
              onChange={(e) => setConfig({ ...config, autoPublishIntervalMinutes: parseInt(e.target.value, 10) })}
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition"
            >
              <option value={15}>Mỗi 15 phút / bài</option>
              <option value={30}>Mỗi 30 phút / bài (Khuyên dùng)</option>
              <option value={60}>Mỗi 1 tiếng / bài</option>
              <option value={120}>Mỗi 2 tiếng / bài</option>
              <option value={240}>Mỗi 4 tiếng / bài</option>
            </select>
          </div>

          {/* Safety threshold */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-semibold uppercase text-zinc-400">
                Ngưỡng Tin Cậy Tối Thiểu Để Tự Duyệt
              </label>
              <span className="text-xs font-bold text-emerald-400">
                {Math.round(config.autoPublishMinSafetyScore * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="0.95"
              step="0.05"
              value={config.autoPublishMinSafetyScore}
              onChange={(e) => setConfig({ ...config, autoPublishMinSafetyScore: parseFloat(e.target.value) })}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <p className="text-[11px] text-zinc-400 mt-1">
              Bài viết có điểm fact-check & tương đồng thấp hơn ngưỡng này sẽ được giữ lại để con người kiểm tra thủ công.
            </p>
          </div>

          {/* Save Button */}
          <div className="pt-4">
            <button
              onClick={() => handleSave()}
              disabled={saving || loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-purple-600/20 transition active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Đang lưu cấu hình...' : 'Lưu Thay Đổi Cấu Hình'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Recent Autonomous Publishing Stream ─── */}
      <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80">
        <h3 className="text-base font-semibold text-white mb-4">
          Nhật Ký Xuất Bản Tự Động (Auto-Pilot Stream)
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-zinc-400 border-b border-zinc-800 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-2.5 px-3">Thời gian tạo</th>
                <th className="py-2.5 px-3">Fanpage Đích</th>
                <th className="py-2.5 px-3">Loại bài</th>
                <th className="py-2.5 px-3">Thời gian đăng</th>
                <th className="py-2.5 px-3 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {recentAutoJobs && recentAutoJobs.length > 0 ? (
                recentAutoJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-zinc-800/30 transition">
                    <td className="py-3 px-3 text-zinc-400 font-mono">
                      {new Date(job.createdAt).toLocaleTimeString('vi-VN')}{' '}
                      <span className="text-[10px] text-zinc-500">
                        {new Date(job.createdAt).toLocaleDateString('vi-VN')}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-medium text-white">
                      {job.pageConnection?.pageName || 'Fanpage Facebook'}
                    </td>
                    <td className="py-3 px-3 font-mono text-purple-400 font-semibold">
                      {job.publicationType}
                    </td>
                    <td className="py-3 px-3 text-zinc-400 font-mono">
                      {job.publishedAt
                        ? new Date(job.publishedAt).toLocaleTimeString('vi-VN')
                        : job.publishAtUtc
                        ? `Hẹn: ${new Date(job.publishAtUtc).toLocaleTimeString('vi-VN')}`
                        : 'Ngay lập tức'}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          job.status === 'PUBLISHED'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : job.status === 'SCHEDULED' || job.status === 'QUEUED'
                            ? 'bg-sky-500/10 text-sky-400'
                            : 'bg-rose-500/10 text-rose-400'
                        }`}
                      >
                        {job.status === 'PUBLISHED'
                          ? 'Đã xuất bản'
                          : job.status === 'SCHEDULED'
                          ? 'Đã hẹn giờ'
                          : job.status === 'QUEUED'
                          ? 'Đang xếp hàng'
                          : 'Thất bại'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-500">
                    Chưa có bài viết nào được xuất bản tự động qua Auto-Pilot
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
