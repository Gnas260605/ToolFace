/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface SourceInfo {
  name: string;
  attributionName: string;
  domain: string;
  trustLevel: string;
}

interface Article {
  id: string;
  title: string;
  summary: string | null;
  author: string | null;
  canonicalUrl: string;
  originalUrl: string;
  publishedAt: string;
  discoveredAt: string;
  category: string;
  language: string;
  imageUrl: string | null;
  contentExcerpt: string | null;
  riskLevel: string;
  extractionStatus: string;
  archivedAt: string | null;
  source: SourceInfo;
  clusterArticles?: Array<{
    clusterId: string;
    cluster: {
      canonicalTopic: string;
    };
  }>;
}


export default function ArticlesPage() {
  const params = useParams();
  const workspaceSlug = (params.workspaceSlug as string) || 'default-workspace';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  // Filters state
  const [sourcesList, setSourcesList] = useState<any[]>([]);
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedRisk, setSelectedRisk] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'OWNER' | 'EDITOR' | 'VIEWER'>('OWNER');

  // Articles state
  const [articles, setArticles] = useState<Article[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail Modal state
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [articleDetail, setArticleDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Fetch sources list for filtering
  useEffect(() => {
    fetch(`${apiUrl}/api/v1/workspaces/${workspaceSlug}/sources`, {
      headers: { 'x-user-role': role, 'x-workspace-id': workspaceSlug },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setSourcesList(data))
      .catch(() => {});
  }, [workspaceSlug, role]);

  // Fetch articles feed
  const fetchArticles = async (cursorValue?: string, append = false) => {
    setLoading(true);
    try {
      let url = `${apiUrl}/api/v1/workspaces/${workspaceSlug}/articles?limit=10`;
      if (selectedSource) url += `&sourceId=${selectedSource}`;
      if (selectedCategory) url += `&category=${selectedCategory}`;
      if (selectedRisk) url += `&riskLevel=${selectedRisk}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (cursorValue) url += `&cursor=${cursorValue}`;

      const res = await fetch(url, {
        headers: {
          'x-user-role': role,
          'x-workspace-id': workspaceSlug,
        },
      });

      if (!res.ok) throw new Error('Không thể tải luồng tin tức');
      const result = await res.json();

      if (append) {
        setArticles((prev) => [...prev, ...result.data]);
      } else {
        setArticles(result.data);
      }
      setNextCursor(result.nextCursor || null);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, [workspaceSlug, selectedSource, selectedCategory, selectedRisk, search, role]);

  // Fetch article detail
  const handleOpenDetail = async (id: string) => {
    setSelectedArticleId(id);
    setDetailLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/workspaces/${workspaceSlug}/articles/${id}`, {
        headers: { 'x-user-role': role, 'x-workspace-id': workspaceSlug },
      });
      if (!res.ok) throw new Error('Không thể tải chi tiết bài viết');
      const data = await res.json();
      setArticleDetail(data);
    } catch (e: any) {
      alert(e.message);
      setSelectedArticleId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleArchive = async (id: string) => {
    if (!confirm('Bạn có muốn lưu trữ (archive) bài viết này không?')) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/workspaces/${workspaceSlug}/articles/${id}/archive`, {
        method: 'POST',
        headers: { 'x-user-role': role, 'x-workspace-id': workspaceSlug },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Lưu trữ thất bại');
      }
      alert('Đã chuyển bài viết vào thư mục lưu trữ.');
      setSelectedArticleId(null);
      fetchArticles();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const isReadonly = role === 'VIEWER';

  return (
    <div className="space-y-8">
      {/* Header & Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">Luồng tin tức</h1>
          <p className="text-sm text-gray-400">Danh sách tin tức thu thập, làm sạch và gom nhóm theo chủ đề tự động.</p>
        </div>

        {/* Role Switcher */}
        <div className="flex items-center space-x-2 bg-[#0a0f1d] border border-gray-800/40 rounded-xl px-3 py-1.5 align-self-start md:align-self-auto">
          <span className="text-[10px] uppercase font-bold text-gray-500">Vai trò test:</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
            className="bg-transparent text-xs font-semibold text-brand-400 focus:outline-none cursor-pointer"
          >
            <option value="OWNER">OWNER (Quản trị)</option>
            <option value="EDITOR">EDITOR (Biên tập)</option>
            <option value="VIEWER">VIEWER (Chỉ xem)</option>
          </select>
        </div>
      </div>

      {/* Filter panel */}
      <div className="p-5 rounded-2xl bg-[#0a0f1d]/40 border border-gray-800/40 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
        {/* Search */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Tìm kiếm</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nhập tiêu đề..."
            className="w-full px-3 py-2 rounded-xl bg-gray-900 border border-gray-800/60 text-xs focus:outline-none focus:border-brand-500 text-white"
          />
        </div>

        {/* Sources filter */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Nguồn tin</label>
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-gray-900 border border-gray-800/60 text-xs focus:outline-none focus:border-brand-500 text-white"
          >
            <option value="">Tất cả</option>
            {sourcesList.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Category filter */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Chuyên mục</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-gray-900 border border-gray-800/60 text-xs focus:outline-none focus:border-brand-500 text-white"
          >
            <option value="">Tất cả</option>
            <option value="football">Football / Bóng đá</option>
            <option value="sports">Thể thao</option>
            <option value="general">Tổng hợp</option>
          </select>
        </div>

        {/* Risk Filter */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Độ trùng lặp / Rủi ro</label>
          <select
            value={selectedRisk}
            onChange={(e) => setSelectedRisk(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-gray-900 border border-gray-800/60 text-xs focus:outline-none focus:border-brand-500 text-white"
          >
            <option value="">Tất cả</option>
            <option value="LOW">LOW (Bài gốc / Ít trùng)</option>
            <option value="MEDIUM">MEDIUM (Trùng nội dung)</option>
            <option value="HIGH">HIGH (Bị trùng nặng)</option>
          </select>
        </div>

        {/* Reset button */}
        <div className="flex items-end">
          <button
            onClick={() => {
              setSelectedSource('');
              setSelectedCategory('');
              setSelectedRisk('');
              setSearch('');
            }}
            className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold text-xs rounded-xl transition"
          >
            Xóa bộ lọc
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          <span>{error}</span>
        </div>
      )}

      {/* Feed list */}
      <div className="space-y-4">
        {articles.length === 0 && !loading ? (
          <div className="text-center py-16 rounded-2xl bg-gradient-to-b from-[#101524]/20 to-[#0c101c]/20 border border-gray-800/40">
            <h3 className="text-sm font-bold text-white">Không tìm thấy bài viết nào</h3>
            <p className="text-xs text-gray-400 mt-1">Vui lòng kiểm tra lại bộ lọc hoặc quét thủ công các nguồn tin cấp.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {articles.map((article) => {
              const clusterInfo = article.clusterArticles?.[0];
              const isDuplicate = article.riskLevel === 'MEDIUM';

              return (
                <div
                  key={article.id}
                  className={`p-6 rounded-2xl bg-gradient-to-b from-[#101524]/40 to-[#0c101c]/40 border backdrop-blur-md transition-all duration-200 hover:border-gray-700/60 ${
                    isDuplicate ? 'border-yellow-500/20' : 'border-gray-800/40'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      {/* Meta Tags */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-500/10 text-brand-400 border border-brand-500/20">
                          {article.source.attributionName}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-800 text-gray-400">
                          {article.category}
                        </span>
                        {isDuplicate && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                            Khớp nội dung (Trùng lặp)
                          </span>
                        )}
                        {clusterInfo && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-400">
                            Chủ đề: {clusterInfo.cluster.canonicalTopic}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3
                        onClick={() => handleOpenDetail(article.id)}
                        className="text-base font-bold text-white hover:text-brand-400 cursor-pointer transition line-clamp-2"
                      >
                        {article.title}
                      </h3>

                      {/* Excerpt */}
                      <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed font-light">
                        {article.contentExcerpt || article.summary || 'Không có bản tóm tắt nội dung...'}
                      </p>

                      {/* Footnotes */}
                      <div className="flex items-center space-x-4 pt-2 text-[10px] text-gray-500 font-medium">
                        <span>Đăng: {new Date(article.publishedAt).toLocaleString('vi-VN')}</span>
                        <span>Thu thập: {new Date(article.discoveredAt).toLocaleString('vi-VN')}</span>
                        {article.author && <span>Tác giả: {article.author}</span>}
                      </div>
                    </div>

                    {/* Actions button */}
                    <div className="flex sm:flex-col items-stretch justify-end gap-2 self-end sm:self-start">
                      <button
                        onClick={() => handleOpenDetail(article.id)}
                        className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold transition"
                      >
                        Xem chi tiết
                      </button>
                      <a
                        href={article.originalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 rounded-xl text-xs font-semibold transition text-center"
                      >
                        Đọc nguồn gốc
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Load more */}
        {nextCursor && (
          <div className="text-center pt-4">
            <button
              onClick={() => fetchArticles(nextCursor, true)}
              disabled={loading}
              className="px-6 py-2.5 bg-[#0a0f1d] hover:bg-gray-800 border border-gray-800/60 text-white rounded-xl text-xs font-semibold transition"
            >
              {loading ? 'Đang tải thêm...' : 'Tải thêm tin'}
            </button>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {selectedArticleId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0a0f1d] border border-gray-800/40 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-800/20 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Chi tiết bài viết</h3>
              <button
                onClick={() => setSelectedArticleId(null)}
                className="text-gray-400 hover:text-white transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {detailLoading ? (
              <div className="p-8 space-y-4 animate-pulse">
                <div className="h-6 bg-gray-800/60 rounded-md w-3/4"></div>
                <div className="h-4 bg-gray-800/60 rounded-md w-full"></div>
                <div className="h-20 bg-gray-800/60 rounded-md w-full"></div>
              </div>
            ) : (
              articleDetail && (
                <div className="p-6 space-y-6 overflow-y-auto">
                  {/* Title & Metadata */}
                  <div className="space-y-3">
                    <h2 className="text-xl font-bold text-white leading-snug">{articleDetail.title}</h2>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded font-bold bg-brand-500/10 text-brand-400 border border-brand-500/20">
                        Nguồn: {articleDetail.source.attributionName} ({articleDetail.source.domain})
                      </span>
                      <span className="px-2 py-0.5 rounded font-bold bg-gray-800 text-gray-400">
                        {articleDetail.category}
                      </span>
                      <span className="px-2 py-0.5 rounded font-bold bg-gray-800 text-gray-400">
                        Rủi ro: {articleDetail.riskLevel}
                      </span>
                      <span className="px-2 py-0.5 rounded font-bold bg-gray-800 text-gray-400">
                        Bóc tách: {articleDetail.extractionStatus}
                      </span>
                    </div>
                  </div>

                  {/* HTML excerpt body */}
                  <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800/40 space-y-3">
                    <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Nội dung trích xuất sạch (Excerpt)</h4>
                    <p className="text-xs text-gray-300 leading-relaxed font-light whitespace-pre-wrap">
                      {articleDetail.contentExcerpt || articleDetail.summary || 'Không thể bóc tách nội dung chi tiết cho bài viết này.'}
                    </p>
                  </div>

                  {/* Story clustering info */}
                  {articleDetail.clusterArticles && articleDetail.clusterArticles.length > 0 && (
                    <div className="p-4 rounded-xl bg-blue-950/10 border border-blue-900/20 space-y-3">
                      <h4 className="text-xs font-bold text-blue-400">Gom nhóm chủ đề tin tức trùng lặp</h4>
                      <p className="text-xs text-gray-400">
                        Bài viết được hệ thống nhận diện tự động thuộc nhóm: <strong className="text-white">"{articleDetail.clusterArticles[0].cluster.canonicalTopic}"</strong>.
                      </p>

                      {/* Display similar articles in cluster */}
                      {articleDetail.clusterArticles[0].cluster.clusterArticles && (
                        <div className="space-y-2 mt-2 pt-2 border-t border-gray-800/40">
                          <span className="text-[10px] font-bold text-gray-500 uppercase">Các nguồn tin đăng tải tương tự:</span>
                          <ul className="space-y-1.5">
                            {articleDetail.clusterArticles[0].cluster.clusterArticles.map((rel: any) => (
                              <li key={rel.article.id} className="text-xs flex items-center justify-between text-gray-300">
                                <a
                                  href={rel.article.canonicalUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="hover:underline text-brand-400 truncate max-w-sm"
                                >
                                  {rel.article.title}
                                </a>
                                <span className="text-[10px] text-gray-500">Khớp: {(rel.similarityScore * 100).toFixed(0)}%</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Footer links */}
                  <div className="pt-6 border-t border-gray-800/20 flex flex-wrap items-center justify-between gap-4">
                    <span className="text-[10px] text-gray-500">Đường dẫn canonical: {articleDetail.canonicalUrl}</span>
                    <div className="flex items-center space-x-3">
                      {!isReadonly && !articleDetail.archivedAt && (
                        <button
                          onClick={() => handleArchive(articleDetail.id)}
                          className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl text-xs font-semibold transition"
                        >
                          Lưu trữ (Archive)
                        </button>
                      )}
                      <a
                        href={articleDetail.originalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold transition"
                      >
                        Đọc bản gốc
                      </a>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
