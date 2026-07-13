/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Source {
  id: string;
  name: string;
  domain: string;
  feedUrl: string;
  sourceType: string;
  language: string;
  category: string;
  trustLevel: string;
  pollIntervalSeconds: number;
  allowPageExtraction: boolean;
  attributionName: string;
  status: string;
  healthStatus: string;
  lastPolledAt: string | null;
  lastSuccessAt: string | null;
  nextPollAt: string;
  consecutiveFailures: number;
  lastErrorMessage: string | null;
}

export default function SourcesPage() {
  const params = useParams();
  const workspaceSlug = (params.workspaceSlug as string) || 'default-workspace';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  // State
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<'OWNER' | 'EDITOR' | 'VIEWER'>('OWNER');
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    feedUrl: '',
    sourceType: 'OFFICIAL_RSS',
    language: 'vi',
    country: 'VN',
    category: 'football',
    trustLevel: 'MEDIUM',
    pollIntervalSeconds: 900,
    allowPageExtraction: false,
    attributionName: '',
    licenseNotes: '',
  });

  // Test State
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    valid: boolean;
    feedType?: string;
    entryCount?: number;
    title?: string;
    error?: string;
  } | null>(null);

  // Loading actions state
  const [actionSourceId, setActionSourceId] = useState<string | null>(null);

  const fetchSources = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/workspaces/${workspaceSlug}/sources`, {
        headers: {
          'x-user-role': role,
          'x-workspace-id': workspaceSlug,
        },
      });
      if (!res.ok) throw new Error('Không thể tải danh sách nguồn tin');
      const data = await res.json();
      setSources(data);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSources();
  }, [workspaceSlug, role]);

  const handleOpenCreateModal = () => {
    setEditingSource(null);
    setFormData({
      name: '',
      feedUrl: '',
      sourceType: 'OFFICIAL_RSS',
      language: 'vi',
      country: 'VN',
      category: 'football',
      trustLevel: 'MEDIUM',
      pollIntervalSeconds: 900,
      allowPageExtraction: false,
      attributionName: '',
      licenseNotes: '',
    });
    setTestResult(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (source: Source) => {
    setEditingSource(source);
    setFormData({
      name: source.name,
      feedUrl: source.feedUrl,
      sourceType: source.sourceType,
      language: source.language,
      country: 'VN',
      category: source.category,
      trustLevel: source.trustLevel,
      pollIntervalSeconds: source.pollIntervalSeconds,
      allowPageExtraction: source.allowPageExtraction,
      attributionName: source.attributionName,
      licenseNotes: '',
    });
    setTestResult(null);
    setIsModalOpen(true);
  };

  const handleTestConnection = async () => {
    if (!formData.feedUrl) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${apiUrl}/api/v1/workspaces/${workspaceSlug}/sources/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': role,
          'x-workspace-id': workspaceSlug,
        },
        body: JSON.stringify({ feedUrl: formData.feedUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestResult({ valid: false, error: data.message || 'Kiểm tra thất bại' });
      } else {
        setTestResult({
          valid: true,
          feedType: data.feedType,
          entryCount: data.entryCount,
          title: data.title,
        });
        if (!formData.name) {
          setFormData((prev) => ({
            ...prev,
            name: data.title || '',
            attributionName: data.title || '',
          }));
        }
      }
    } catch (e: any) {
      setTestResult({ valid: false, error: e.message || 'Kết nối lỗi' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const method = editingSource ? 'PATCH' : 'POST';
      const path = editingSource
        ? `${apiUrl}/api/v1/workspaces/${workspaceSlug}/sources/${editingSource.id}`
        : `${apiUrl}/api/v1/workspaces/${workspaceSlug}/sources`;

      const res = await fetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': role,
          'x-workspace-id': workspaceSlug,
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Không thể lưu nguồn tin');
      }

      setIsModalOpen(false);
      fetchSources();
    } catch (e: any) {
      alert(e.message || 'Có lỗi xảy ra');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xoá nguồn tin này không?')) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/workspaces/${workspaceSlug}/sources/${id}`, {
        method: 'DELETE',
        headers: {
          'x-user-role': role,
          'x-workspace-id': workspaceSlug,
        },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Không thể xoá nguồn tin');
      }
      fetchSources();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleManualPoll = async (id: string) => {
    setActionSourceId(id);
    try {
      const res = await fetch(`${apiUrl}/api/v1/workspaces/${workspaceSlug}/sources/${id}/poll`, {
        method: 'POST',
        headers: {
          'x-user-role': role,
          'x-workspace-id': workspaceSlug,
        },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Không thể yêu cầu quét');
      }
      alert('Đã gửi yêu cầu quét tin nền. Kết quả quét sẽ cập nhật sau vài giây.');
      fetchSources();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActionSourceId(null);
    }
  };

  const handleToggleState = async (source: Source) => {
    const action = source.status === 'ACTIVE' ? 'disable' : 'enable';
    try {
      const res = await fetch(`${apiUrl}/api/v1/workspaces/${workspaceSlug}/sources/${source.id}/${action}`, {
        method: 'POST',
        headers: {
          'x-user-role': role,
          'x-workspace-id': workspaceSlug,
        },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Cập nhật thất bại');
      }
      fetchSources();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Helper styles
  const getHealthBadge = (health: string) => {
    switch (health) {
      case 'HEALTHY':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Khỏe mạnh</span>;
      case 'DEGRADED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Suy giảm</span>;
      case 'FAILING':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20">Lỗi nghiêm trọng</span>;
      case 'DISABLED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/10 text-gray-400 border border-gray-500/20">Đã tắt</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">Chưa rõ</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400">Hoạt động</span>;
      case 'DISABLED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/20 text-gray-400">Đã tắt</span>;
      case 'AUTO_DISABLED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">Tự động khóa</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/20 text-gray-400">{status}</span>;
    }
  };

  const isReadonly = role === 'VIEWER';

  return (
    <div className="space-y-8">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">Nguồn cấp tin</h1>
          <p className="text-sm text-gray-400">Quản lý, kiểm tra và thiết lập chu kỳ quét tin tức tự động từ RSS/Atom feeds.</p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Role Switcher for Testing */}
          <div className="flex items-center space-x-2 bg-[#0a0f1d] border border-gray-800/40 rounded-xl px-3 py-1.5">
            <span className="text-[10px] uppercase font-bold text-gray-500">Vai trò test:</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="bg-transparent text-xs font-semibold text-brand-400 focus:outline-none cursor-pointer"
            >
              <option value="OWNER" className="bg-[#0a0f1d] text-white">OWNER (Quản trị)</option>
              <option value="EDITOR" className="bg-[#0a0f1d] text-white">EDITOR (Biên tập)</option>
              <option value="VIEWER" className="bg-[#0a0f1d] text-white">VIEWER (Chỉ xem)</option>
            </select>
          </div>

          {!isReadonly && (
            <button
              onClick={handleOpenCreateModal}
              className="inline-flex items-center space-x-2 bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-500 hover:to-blue-500 text-white font-medium text-sm px-4 py-2.5 rounded-xl transition duration-150 shadow-lg shadow-brand-500/10"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              <span>Thêm nguồn tin</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center space-x-3">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-12 bg-gray-800/40 rounded-xl"></div>
          <div className="h-20 bg-gray-800/40 rounded-xl"></div>
          <div className="h-20 bg-gray-800/40 rounded-xl"></div>
        </div>
      ) : sources.length === 0 ? (
        <div className="text-center py-16 rounded-2xl bg-gradient-to-b from-[#101524]/40 to-[#0c101c]/40 border border-gray-800/40">
          <div className="inline-flex p-4 rounded-full bg-brand-950/20 border border-brand-900/30 text-brand-400 mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-white">Chưa có nguồn tin cấp nào</h3>
          <p className="text-sm text-gray-400 max-w-sm mx-auto mt-2">Bắt đầu kết nối các kênh tin tức để tự động gom nhóm bài viết.</p>
          {!isReadonly && (
            <button
              onClick={handleOpenCreateModal}
              className="mt-4 bg-brand-600 hover:bg-brand-500 text-white font-medium text-xs px-4 py-2.5 rounded-lg transition"
            >
              Thêm nguồn đầu tiên
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-gradient-to-b from-[#101524]/20 to-[#0c101c]/20 border border-gray-800/40 shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-800/40 text-gray-400 text-xs font-semibold uppercase tracking-wider bg-[#0a0f1d]/40">
                <th className="p-4">Tên / RSS URL</th>
                <th className="p-4">Miền gốc</th>
                <th className="p-4">Trạng thái</th>
                <th className="p-4">Sức khỏe</th>
                <th className="p-4">Lần quét cuối / tiếp theo</th>
                <th className="p-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/20 text-sm">
              {sources.map((source) => (
                <tr key={source.id} className="hover:bg-gray-800/10 transition-colors">
                  <td className="p-4">
                    <div>
                      <p className="font-bold text-white text-sm">{source.name}</p>
                      <p className="text-xs text-gray-500 font-mono mt-1 truncate max-w-xs">{source.feedUrl}</p>
                    </div>
                  </td>
                  <td className="p-4 text-gray-300 font-mono text-xs">{source.domain}</td>
                  <td className="p-4">{getStatusBadge(source.status)}</td>
                  <td className="p-4">
                    {getHealthBadge(source.healthStatus)}
                    {source.consecutiveFailures > 0 && (
                      <p className="text-[10px] text-orange-400 mt-1 font-medium">Lỗi liên tiếp: {source.consecutiveFailures}</p>
                    )}
                  </td>
                  <td className="p-4 text-xs text-gray-400 space-y-1">
                    <p>Cuối: {source.lastPolledAt ? new Date(source.lastPolledAt).toLocaleString('vi-VN') : 'Chưa chạy'}</p>
                    <p className="text-brand-400">Tiếp: {new Date(source.nextPollAt).toLocaleString('vi-VN')}</p>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button
                      onClick={() => handleManualPoll(source.id)}
                      disabled={isReadonly || source.status !== 'ACTIVE' || actionSourceId === source.id}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 transition disabled:opacity-40"
                    >
                      Quét
                    </button>
                    {!isReadonly && (
                      <>
                        <button
                          onClick={() => handleToggleState(source)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                            source.status === 'ACTIVE'
                              ? 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                          }`}
                        >
                          {source.status === 'ACTIVE' ? 'Tắt' : 'Bật'}
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(source)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 text-gray-300 hover:bg-gray-700 transition"
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => handleDelete(source.id)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition"
                        >
                          Xoá
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0a0f1d] border border-gray-800/40 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-gray-800/20 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {editingSource ? 'Sửa nguồn tin cấp' : 'Thêm nguồn tin mới'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase">Địa chỉ Feed URL *</label>
                <div className="flex space-x-2">
                  <input
                    type="url"
                    required
                    value={formData.feedUrl}
                    onChange={(e) => setFormData({ ...formData, feedUrl: e.target.value })}
                    placeholder="https://example.com/rss.xml"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-sm focus:outline-none focus:border-brand-500 text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing || !formData.feedUrl}
                    className="px-4 bg-brand-600 hover:bg-brand-500 disabled:bg-gray-800 text-white rounded-xl text-xs font-semibold transition"
                  >
                    {testing ? 'Đang thử...' : 'Test'}
                  </button>
                </div>

                {/* Connection Test feedback */}
                {testResult && (
                  <div className={`mt-2 p-3 rounded-lg border text-xs ${
                    testResult.valid
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                  }`}>
                    {testResult.valid ? (
                      <div>
                        <p className="font-bold">✓ Kết nối thành công!</p>
                        <p className="mt-1">Tên RSS: {testResult.title} | Định dạng: {testResult.feedType} ({testResult.entryCount} tin)</p>
                      </div>
                    ) : (
                      <p>✗ Lỗi: {testResult.error}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase">Tên hiển thị *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Báo bóng đá chính thức"
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-sm focus:outline-none focus:border-brand-500 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase">Tên tác quyền / Attribution *</label>
                  <input
                    type="text"
                    required
                    value={formData.attributionName}
                    onChange={(e) => setFormData({ ...formData, attributionName: e.target.value })}
                    placeholder="Bóng Đá VN"
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-sm focus:outline-none focus:border-brand-500 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase">Kiểu nguồn *</label>
                  <select
                    value={formData.sourceType}
                    onChange={(e) => setFormData({ ...formData, sourceType: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-sm focus:outline-none focus:border-brand-500 text-white"
                  >
                    <option value="OFFICIAL_RSS">OFFICIAL_RSS</option>
                    <option value="OFFICIAL_API">OFFICIAL_API</option>
                    <option value="MANUAL_URL">MANUAL_URL</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase">Mức tin cậy *</label>
                  <select
                    value={formData.trustLevel}
                    onChange={(e) => setFormData({ ...formData, trustLevel: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-sm focus:outline-none focus:border-brand-500 text-white"
                  >
                    <option value="OFFICIAL">OFFICIAL (Tuyệt đối)</option>
                    <option value="HIGH">HIGH (Cao)</option>
                    <option value="MEDIUM">MEDIUM (Vừa)</option>
                    <option value="LOW">LOW (Thấp)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase">Chu kỳ quét *</label>
                  <select
                    value={formData.pollIntervalSeconds}
                    onChange={(e) => setFormData({ ...formData, pollIntervalSeconds: parseInt(e.target.value, 10) })}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-sm focus:outline-none focus:border-brand-500 text-white"
                  >
                    <option value={300}>5 phút (Dev)</option>
                    <option value={900}>15 phút</option>
                    <option value={3600}>1 giờ</option>
                    <option value={86400}>1 ngày</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase">Chuyên mục *</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-sm focus:outline-none focus:border-brand-500 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase">Ngôn ngữ *</label>
                  <input
                    type="text"
                    value={formData.language}
                    onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-sm focus:outline-none focus:border-brand-500 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase">Quốc gia *</label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-sm focus:outline-none focus:border-brand-500 text-white"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-3 p-3 rounded-xl bg-gray-900 border border-gray-800">
                <input
                  type="checkbox"
                  id="allowPageExtraction"
                  checked={formData.allowPageExtraction}
                  onChange={(e) => setFormData({ ...formData, allowPageExtraction: e.target.checked })}
                  className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-gray-900 border-gray-800 cursor-pointer"
                />
                <label htmlFor="allowPageExtraction" className="text-xs font-medium text-gray-300 cursor-pointer select-none">
                  Cho phép bóc tách nội dung HTML đầy đủ (Page extraction) từ tên miền đã duyệt.
                </label>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase">Ghi chú giấy phép bản quyền</label>
                <textarea
                  value={formData.licenseNotes}
                  onChange={(e) => setFormData({ ...formData, licenseNotes: e.target.value })}
                  placeholder="Giấy phép sử dụng RSS công cộng của trang tin"
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-sm focus:outline-none focus:border-brand-500 text-white h-20"
                />
              </div>

              <div className="pt-4 border-t border-gray-800/20 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gray-800 text-gray-300 hover:bg-gray-700 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!testResult?.valid}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-500 hover:to-blue-500 text-white transition disabled:opacity-40"
                >
                  {editingSource ? 'Lưu chỉnh sửa' : 'Tạo nguồn tin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
