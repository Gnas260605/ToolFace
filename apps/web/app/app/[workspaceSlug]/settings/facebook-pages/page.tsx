'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface FacebookConnection {
  id: string;
  pageId: string;
  pageName: string;
  pageCategory: string;
  status: string;
  grantedTasksJson: string[];
  connectedByUserId: string;
  createdAt: string;
}

interface AvailablePage {
  pageId: string;
  pageName: string;
  category: string;
  grantedTasks: string[];
  canPublish: boolean;
}

function FacebookPagesSettingsContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceSlug = (params.workspaceSlug as string) || 'default-workspace';

  const [connections, setConnections] = useState<FacebookConnection[]>([]);
  const [availablePages, setAvailablePages] = useState<AvailablePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingAvailable, setFetchingAvailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Selection state for linking new pages
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);

  const tempToken = searchParams.get('temp_token');

  // Load existing connections
  const loadConnections = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceSlug}/facebook/pages`, {
        headers: {
          'x-user-role': 'OWNER',
          'x-workspace-id': workspaceSlug,
        },
      });
      if (!res.ok) throw new Error('Không thể tải danh sách trang đã liên kết');
      const data = await res.json();
      setConnections(data);
    } catch (e: any) {
      setError(e.message || 'Lỗi khi tải kết nối Facebook');
    }
  }, [workspaceSlug]);

  // Load available pages from temp token
  const loadAvailablePages = useCallback(async (token: string) => {
    setFetchingAvailable(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/workspaces/${workspaceSlug}/facebook/available-pages?temp_token=${token}`,
        {
          headers: {
            'x-user-role': 'OWNER',
            'x-workspace-id': workspaceSlug,
          },
        }
      );
      if (!res.ok) throw new Error('Không thể tải các trang khả dụng từ tài khoản Facebook');
      const data = await res.json();
      setAvailablePages(data.pages || []);
    } catch (e: any) {
      setError(e.message || 'Lỗi khi tải danh sách trang khả dụng');
    } finally {
      setFetchingAvailable(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      loadConnections(),
      tempToken ? loadAvailablePages(tempToken) : Promise.resolve(),
    ]).finally(() => {
      setLoading(false);
    });
  }, [loadConnections, loadAvailablePages, tempToken]);

  // Start OAuth Link
  const handleInitiateOAuth = () => {
    setError(null);
    setSuccess(null);
    window.location.href = `${API_BASE}/api/v1/integrations/facebook/connect?workspaceId=${workspaceSlug}`;
  };

  // Toggle selection
  const handleToggleSelectPage = (pageId: string) => {
    setSelectedPageIds((prev) =>
      prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]
    );
  };

  // Connect selected pages
  const handleConnectSelected = async () => {
    if (selectedPageIds.length === 0) {
      setError('Vui lòng chọn ít nhất một trang để liên kết.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      let connectedCount = 0;
      for (const pageId of selectedPageIds) {
        const page = availablePages.find((p) => p.pageId === pageId);
        if (!page) continue;

        const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceSlug}/facebook/pages/connect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': 'OWNER',
            'x-workspace-id': workspaceSlug,
            'x-user-id': 'mock-default-user-id',
          },
          body: JSON.stringify({
            pageId: page.pageId,
            pageName: page.pageName,
            category: page.category,
            grantedTasks: page.grantedTasks,
            pageAccessToken: 'mock_page_access_token_' + page.pageId,
          }),
        });

        if (res.ok) {
          connectedCount++;
        } else {
          const errData = await res.json();
          throw new Error(errData.message || `Lỗi khi liên kết trang ${page.pageName}`);
        }
      }

      setSuccess(`Đã liên kết thành công ${connectedCount} trang Facebook!`);
      setSelectedPageIds([]);
      setAvailablePages([]);
      
      // Clean up URL queries
      router.replace(`/app/${workspaceSlug}/settings/facebook-pages`);
      await loadConnections();
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra trong quá trình liên kết trang');
    } finally {
      setSubmitting(false);
    }
  };

  // Disconnect Page Connection
  const handleDisconnect = async (connectionId: string, pageName: string) => {
    if (!confirm(`Bạn có chắc chắn muốn hủy liên kết trang "${pageName}"?`)) return;
    
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceSlug}/facebook/pages/${connectionId}`, {
        method: 'DELETE',
        headers: {
          'x-user-role': 'OWNER',
          'x-workspace-id': workspaceSlug,
        },
      });
      if (!res.ok) throw new Error('Hủy liên kết thất bại');
      
      setSuccess(`Đã hủy liên kết thành công trang "${pageName}".`);
      await loadConnections();
    } catch (e: any) {
      setError(e.message || 'Lỗi khi hủy liên kết');
    }
  };

  const handleCancelLink = () => {
    router.replace(`/app/${workspaceSlug}/settings/facebook-pages`);
    setAvailablePages([]);
    setSelectedPageIds([]);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-12 h-12 rounded-full border-4 border-t-brand-500 border-gray-800 animate-spin" />
        <p className="text-sm text-gray-400">Đang tải cấu hình kết nối Facebook...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-[10px] tracking-[0.2em] font-bold text-brand-400 uppercase">Cài đặt kênh phân phối</span>
          <h1 className="text-3xl font-extrabold text-white mt-1">Liên kết Facebook Pages</h1>
          <p className="text-sm text-gray-400 mt-2">
            Quản lý tài khoản Facebook Pages và phân quyền đăng bài viết tự động từ các bản nháp tin tức.
          </p>
        </div>
        {!tempToken && (
          <button
            onClick={handleInitiateOAuth}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-500 hover:to-blue-500 text-white font-semibold text-sm transition-all duration-300 shadow-lg shadow-brand-500/10 flex items-center gap-2 hover:scale-[1.02]"
          >
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            Liên kết Facebook mới
          </button>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-950/40 border border-red-800/40 text-red-400 text-sm flex gap-3 items-center">
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-800/30 text-emerald-400 text-sm flex gap-3 items-center">
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{success}</span>
        </div>
      )}

      {/* Temp Token / Available Pages Flow */}
      {tempToken && (
        <div className="rounded-3xl border border-brand-500/20 bg-brand-950/10 p-6 md:p-8 space-y-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 rounded-full blur-3xl pointer-events-none -mr-32 -mt-32" />
          
          <div>
            <h2 className="text-xl font-bold text-white">Chọn trang Facebook muốn liên kết</h2>
            <p className="text-xs text-gray-400 mt-1">
              Phát hiện tài khoản Facebook thành công. Hãy chọn các trang bạn có quyền quản lý để kết nối vào workspace này.
            </p>
          </div>

          {fetchingAvailable ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-t-brand-500 border-gray-800 animate-spin" />
              <p className="text-xs text-gray-400">Đang đọc danh sách trang từ Facebook...</p>
            </div>
          ) : availablePages.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-gray-800 rounded-2xl text-gray-500">
              Không tìm thấy trang khả dụng nào hoặc tài khoản Facebook không sở hữu trang nào.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availablePages.map((page) => {
                const isSelected = selectedPageIds.includes(page.pageId);
                return (
                  <div
                    key={page.pageId}
                    onClick={() => handleToggleSelectPage(page.pageId)}
                    className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer flex items-start gap-4 ${
                      isSelected
                        ? 'border-brand-500/50 bg-brand-950/20 shadow-md shadow-brand-500/5'
                        : 'border-gray-800 hover:border-gray-700 bg-slate-900/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // Handle through parent div click
                      className="mt-1 w-4 h-4 rounded text-brand-500 border-gray-700 focus:ring-brand-500/30 bg-gray-800"
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-white leading-snug">{page.pageName}</p>
                      <p className="text-xs text-gray-500">Thể loại: {page.category}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {page.grantedTasks.map((t) => (
                          <span key={t} className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 text-[9px] font-mono">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-800/60">
            <button
              onClick={handleCancelLink}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              onClick={handleConnectSelected}
              disabled={submitting || selectedPageIds.length === 0}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-brand-500 hover:bg-brand-400 text-white transition-colors flex items-center gap-2 shadow-lg shadow-brand-500/10 disabled:opacity-40 disabled:pointer-events-none"
            >
              {submitting && <div className="w-3.5 h-3.5 border-2 border-t-white border-brand-400 rounded-full animate-spin" />}
              Xác nhận liên kết ({selectedPageIds.length})
            </button>
          </div>
        </div>
      )}

      {/* Connected Pages list */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white">Các trang đã liên kết ({connections.length})</h2>

        {connections.length === 0 ? (
          <div className="rounded-3xl border border-gray-800/80 bg-slate-900/10 p-12 text-center flex flex-col items-center justify-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-slate-950 flex items-center justify-center border border-gray-800">
              <svg className="w-7 h-7 text-gray-600 fill-current" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </div>
            <div className="max-w-xs space-y-1">
              <p className="text-sm font-semibold text-gray-300">Chưa có kết nối nào</p>
              <p className="text-xs text-gray-500">
                Hãy liên kết trang Facebook đầu tiên để cấu hình phân phối bản nháp AI tự động.
              </p>
            </div>
            <button
              onClick={handleInitiateOAuth}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors"
            >
              Liên kết tài khoản
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {connections.map((c) => (
              <div
                key={c.id}
                className="group relative p-5 rounded-2xl border border-gray-800/80 bg-[#0a0f1d]/50 hover:bg-[#0c1224]/70 transition-all duration-300 flex flex-col justify-between gap-6"
              >
                <div className="space-y-4">
                  {/* Top line Info */}
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-white group-hover:text-brand-400 transition-colors leading-tight">
                        {c.pageName}
                      </h3>
                      <p className="text-xs text-gray-500 font-medium">Page ID: {c.pageId}</p>
                    </div>
                    {/* Status Badge */}
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/40 text-emerald-400 text-[10px] font-semibold border border-emerald-900/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>{c.status === 'ACTIVE' ? 'Hoạt động' : c.status}</span>
                    </div>
                  </div>

                  {/* Connection Details */}
                  <div className="space-y-2 border-t border-gray-800/40 pt-4 text-xs text-gray-400">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Thể loại:</span>
                      <span className="text-gray-300 font-medium">{c.pageCategory || 'Không rõ'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Người liên kết:</span>
                      <span className="text-gray-300 font-medium truncate max-w-[150px]">{c.connectedByUserId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Ngày tạo:</span>
                      <span className="text-gray-300 font-medium">
                        {new Date(c.createdAt).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-800/20 mt-2">
                  <div className="flex gap-1">
                    {c.grantedTasksJson?.map((t) => (
                      <span key={t} className="px-1.5 py-0.5 rounded bg-slate-900/60 text-slate-400 text-[9px] font-mono font-medium">
                        {t}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={() => handleDisconnect(c.id, c.pageName)}
                    className="px-2.5 py-1.5 text-[10px] font-bold rounded-lg text-red-400 hover:bg-red-950/30 hover:text-red-300 transition-colors"
                  >
                    Huỷ liên kết
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FacebookPagesSettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-12 h-12 rounded-full border-4 border-t-brand-500 border-gray-800 animate-spin" />
        <p className="text-sm text-gray-400">Đang tải...</p>
      </div>
    }>
      <FacebookPagesSettingsContent />
    </Suspense>
  );
}
