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
    <div className="space-y-8 max-w-6xl mx-auto pb-16 animate-fade-in">
      {/* ─── Header ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/40 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl lg:text-3xl font-extrabold tracking-tight text-zinc-100 flex items-center gap-3">
              <span className="p-2 rounded-2xl bg-gradient-to-tr from-accent-500/20 via-teal-500/20 to-emerald-500/20 border border-accent-500/30 text-accent-300 shadow-md">
                🤖
              </span>
              Hệ Thống Tự Động Hóa 100% (AutoPilot)
            </h1>
            <span
              className={`px-3 py-1 rounded-full text-[10px] font-extrabold border flex items-center gap-1.5 font-display ${
                config.autoPilotEnabled
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50 shadow-sm'
                  : 'bg-zinc-800/80 text-zinc-400 border-zinc-700/50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${config.autoPilotEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
              {config.autoPilotEnabled ? 'ĐANG BẬT TỰ ĐỘNG' : 'ĐANG TẮT'}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-2 font-sans leading-relaxed">
            Thu thập tin tức real-time → AI tự tạo kịch bản → Thẩm định Fact-check → Tự động xuất bản lên Fanpage mà không cần can thiệp.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto">
          <button
            onClick={handleTriggerTest}
            disabled={triggering || loading}
            className="btn-shimmer px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-500 via-teal-500 to-emerald-600 hover:from-accent-400 hover:to-emerald-500 text-white text-xs font-bold transition shadow-md shadow-accent-950/40 disabled:opacity-50 flex items-center gap-2 font-display"
          >
            <span className={triggering ? 'animate-spin' : ''}>🔄</span>
            <span>Chạy thử nghiệm ngay</span>
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {message && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-center justify-between shadow-lg font-sans ${
            message.type === 'success'
              ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/40 border border-rose-500/40 text-rose-200'
          }`}
        >
          <span className="font-medium">✨ {message.text}</span>
          <button onClick={() => setMessage(null)} className="text-zinc-400 hover:text-white font-bold ml-4">✕</button>
        </div>
      )}

      {/* ─── Master Auto-Pilot Switch Card ─── */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-surface-raised via-zinc-900/90 to-accent-950/20 border border-zinc-800/80 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2 font-display">
              Kích Hoạt Chế Độ Tự Động Toàn Diện
            </h2>
            <p className="text-xs text-zinc-400 max-w-2xl font-sans leading-relaxed">
              Khi bật chế độ này, tin hot thu thập được từ các báo uy tín sẽ được AI chuyển hóa thành kịch bản Facebook chất lượng cao và tự động đăng bài lên Fanpage đích.
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
            <div className="w-16 h-9 bg-zinc-800/90 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-7 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-7 after:w-7 after:transition-all peer-checked:bg-emerald-500 shadow-inner"></div>
          </label>
        </div>
      </div>

      {/* ─── Detailed Configuration Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Target & Voice */}
        <div className="p-6 rounded-2xl bg-surface-raised border border-zinc-800/60 space-y-5 shadow-lg backdrop-blur-md">
          <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2 border-b border-zinc-800/60 pb-3 font-display">
            <span>🎯</span> Kênh Đích & Phong Cách Viết
          </h3>

          {/* Target Page */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-display">
              Fanpage Facebook Nhận Bài Tự Động
            </label>
            <select
              value={config.autoPublishTargetPageId || ''}
              onChange={(e) => setConfig({ ...config, autoPublishTargetPageId: e.target.value || null })}
              className="w-full bg-zinc-950/70 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-100 focus:outline-none focus:border-accent-500/80 transition font-sans cursor-pointer"
            >
              <option value="">-- Chọn Fanpage đích --</option>
              {availablePages.map((page) => (
                <option key={page.pageId} value={page.pageId} className="bg-zinc-900 text-zinc-200">
                  {page.pageName} ({page.status === 'ACTIVE' ? 'Đã kết nối' : 'Cần xác thực'})
                </option>
              ))}
            </select>
            {availablePages.length === 0 && (
              <p className="text-[11px] text-amber-400 mt-1 font-sans">
                ⚠️ Chưa có Fanpage nào được kết nối. Hãy vào mục <strong>Kênh Facebook</strong> để kết nối trước.
              </p>
            )}
          </div>

          {/* Brand Voice */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-display">
              Hồ Sơ Phong Cách AI (Brand Voice)
            </label>
            <select
              value={config.autoPublishBrandProfileId || ''}
              onChange={(e) => setConfig({ ...config, autoPublishBrandProfileId: e.target.value || null })}
              className="w-full bg-zinc-950/70 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-100 focus:outline-none focus:border-accent-500/80 transition font-sans cursor-pointer"
            >
              <option value="">-- Sử dụng cấu hình mặc định --</option>
              {availableBrands.map((brand) => (
                <option key={brand.id} value={brand.id} className="bg-zinc-900 text-zinc-200">
                  {brand.name} {brand.isDefault ? '(Mặc định)' : ''} — {brand.toneVoice}
                </option>
              ))}
            </select>
          </div>

          {/* Post Type */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-display mb-2">
              Định Dạng Bài Đăng Xuất Bản
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setConfig({ ...config, autoPublishPostType: 'COMMENT_LINK' })}
                className={`p-3 rounded-xl border text-left transition-all ${
                  config.autoPublishPostType === 'COMMENT_LINK'
                    ? 'bg-accent-500/15 border-accent-500/60 text-zinc-100 shadow-md shadow-accent-950/30'
                    : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="font-bold text-xs text-accent-300 font-display">💬 Link Ở Bình Luận</div>
                <div className="text-[10px] text-zinc-400 mt-1 font-sans">Tối ưu Reach, tự đính kèm link bài gốc dưới comment</div>
              </button>

              <button
                type="button"
                onClick={() => setConfig({ ...config, autoPublishPostType: 'LINK' })}
                className={`p-3 rounded-xl border text-left transition-all ${
                  config.autoPublishPostType === 'LINK'
                    ? 'bg-accent-500/15 border-accent-500/60 text-zinc-100 shadow-md shadow-accent-950/30'
                    : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="font-bold text-xs font-display">🔗 Đính Kèm Link Direct</div>
                <div className="text-[10px] text-zinc-400 mt-1 font-sans">Hiển thị thẻ preview của bài báo gốc</div>
              </button>

              <button
                type="button"
                onClick={() => setConfig({ ...config, autoPublishPostType: 'TEXT' })}
                className={`p-3 rounded-xl border text-left transition-all ${
                  config.autoPublishPostType === 'TEXT'
                    ? 'bg-accent-500/15 border-accent-500/60 text-zinc-100 shadow-md shadow-accent-950/30'
                    : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="font-bold text-xs font-display">📝 Pure Caption Text</div>
                <div className="text-[10px] text-zinc-400 mt-1 font-sans">Bài viết thuần văn bản không dẫn link ngoài</div>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Schedule & Guardrails */}
        <div className="p-6 rounded-2xl bg-surface-raised border border-zinc-800/60 space-y-5 shadow-lg backdrop-blur-md">
          <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2 border-b border-zinc-800/60 pb-3 font-display">
            <span>⏱️</span> Tần Suất & Tiêu Chuẩn Thẩm Định
          </h3>

          {/* Interval */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-display">
              Khoảng Cách Thời Gian Giữa Các Bài Đăng
            </label>
            <select
              value={config.autoPublishIntervalMinutes}
              onChange={(e) => setConfig({ ...config, autoPublishIntervalMinutes: parseInt(e.target.value, 10) })}
              className="w-full bg-zinc-950/70 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-100 focus:outline-none focus:border-accent-500/80 transition font-sans cursor-pointer"
            >
              <option value={15} className="bg-zinc-900 text-zinc-200">Mỗi 15 phút / bài</option>
              <option value={30} className="bg-zinc-900 text-zinc-200">Mỗi 30 phút / bài (Khuyên dùng)</option>
              <option value={60} className="bg-zinc-900 text-zinc-200">Mỗi 1 tiếng / bài</option>
              <option value={120} className="bg-zinc-900 text-zinc-200">Mỗi 2 tiếng / bài</option>
              <option value={240} className="bg-zinc-900 text-zinc-200">Mỗi 4 tiếng / bài</option>
            </select>
          </div>

          {/* Safety threshold */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-display">
                Ngưỡng Tin Cậy Tối Thiểu Để Tự Duyệt
              </label>
              <span className="text-xs font-bold text-emerald-400 font-mono">
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
              className="w-full accent-accent-500 cursor-pointer"
            />
            <p className="text-[11px] text-zinc-400 font-sans">
              Bài viết có điểm fact-check thấp hơn ngưỡng này sẽ giữ ở bản nháp để người biên tập duyệt thủ công.
            </p>
          </div>

          {/* Save Button */}
          <div className="pt-2">
            <button
              onClick={() => handleSave()}
              disabled={saving || loading}
              className="btn-shimmer w-full py-3 rounded-xl bg-gradient-to-r from-accent-500 via-teal-500 to-emerald-600 hover:from-accent-400 hover:to-emerald-500 text-white text-xs font-bold shadow-md shadow-accent-950/40 transition active:scale-[0.98] disabled:opacity-50 font-display"
            >
              {saving ? 'Đang lưu cấu hình...' : 'Lưu Thay Đổi Cấu Hình'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Recent Autonomous Publishing Stream ─── */}
      <div className="p-6 rounded-2xl bg-surface-raised border border-zinc-800/60 shadow-lg">
        <h3 className="text-sm font-bold text-zinc-200 mb-4 font-display flex items-center gap-2">
          <span>📜</span> Nhật Ký Xuất Bản Tự Động (AutoPilot Stream)
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className="text-zinc-500 border-b border-zinc-800/80 uppercase tracking-wider font-bold text-[10px] font-display">
              <tr>
                <th className="py-2.5 px-3">Thời gian tạo</th>
                <th className="py-2.5 px-3">Fanpage Đích</th>
                <th className="py-2.5 px-3">Loại bài</th>
                <th className="py-2.5 px-3">Thời gian đăng</th>
                <th className="py-2.5 px-3 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40 text-zinc-300">
              {recentAutoJobs && recentAutoJobs.length > 0 ? (
                recentAutoJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-zinc-800/30 transition">
                    <td className="py-3 px-3 text-zinc-400 font-mono text-[11px]">
                      {new Date(job.createdAt).toLocaleTimeString('vi-VN')}{' '}
                      <span className="text-[10px] text-zinc-500">
                        {new Date(job.createdAt).toLocaleDateString('vi-VN')}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-zinc-200">
                      {job.pageConnection?.pageName || 'Fanpage Facebook'}
                    </td>
                    <td className="py-3 px-3 font-mono text-accent-400 font-bold">
                      {job.publicationType}
                    </td>
                    <td className="py-3 px-3 text-zinc-400 font-mono text-[11px]">
                      {job.publishedAt
                        ? new Date(job.publishedAt).toLocaleTimeString('vi-VN')
                        : job.publishAtUtc
                        ? `Hẹn: ${new Date(job.publishAtUtc).toLocaleTimeString('vi-VN')}`
                        : 'Ngay lập tức'}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold font-display border ${
                          job.status === 'PUBLISHED'
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                            : job.status === 'SCHEDULED' || job.status === 'QUEUED'
                            ? 'bg-sky-950/60 text-sky-300 border-sky-500/30'
                            : 'bg-rose-950/60 text-rose-300 border-rose-500/30'
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
                  <td colSpan={5} className="py-10 text-center text-zinc-500 font-sans">
                    Chưa có bài viết nào được xuất bản tự động qua AutoPilot.
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
