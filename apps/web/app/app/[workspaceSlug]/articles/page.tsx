/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

function decodeHtml(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/&aacute;/gi, 'á')
    .replace(/&agrave;/gi, 'à')
    .replace(/&atilde;/gi, 'ã')
    .replace(/&acirc;/gi, 'â')
    .replace(/&eacute;/gi, 'é')
    .replace(/&egrave;/gi, 'è')
    .replace(/&ecirc;/gi, 'ê')
    .replace(/&iacute;/gi, 'í')
    .replace(/&igrave;/gi, 'ì')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&ograve;/gi, 'ò')
    .replace(/&otilde;/gi, 'õ')
    .replace(/&ocirc;/gi, 'ô')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&ugrave;/gi, 'ù')
    .replace(/&yacute;/gi, 'ý')
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

interface ArticleSource {
  id: string;
  name: string;
  attributionName: string;
  domain: string;
}

interface Article {
  id: string;
  title: string;
  summary: string | null;
  contentExcerpt: string | null;
  publishedAt: string;
  discoveredAt: string;
  category: string;
  originalUrl: string;
  canonicalUrl: string;
  imageUrl?: string | null;
  author?: string | null;
  riskLevel?: string;
  extractionStatus?: string;
  source: ArticleSource;
  clusterArticles?: Array<{
    similarityScore: number;
    cluster: {
      id: string;
      canonicalTopic: string;
      clusterArticles?: Array<{
        similarityScore: number;
        article: {
          id: string;
          title: string;
          canonicalUrl: string;
        };
      }>;
    };
  }>;
}

export default function WorkspaceArticlesPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceSlug = (params.workspaceSlug as string) || 'default-workspace';

  // Filters state
  const [sourcesList, setSourcesList] = useState<any[]>([]);
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedRisk, setSelectedRisk] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'OWNER' | 'EDITOR' | 'VIEWER'>('OWNER');

  // List state
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Detail Modal state
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [articleDetail, setArticleDetail] = useState<Article | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Creating draft loading state
  const [creatingDraftId, setCreatingDraftId] = useState<string | null>(null);

  // Load sources list for filter dropdown
  useEffect(() => {
    fetch(`${apiUrl}/api/v1/workspaces/${workspaceSlug}/sources`, {
      headers: { 'x-user-role': role, 'x-workspace-id': workspaceSlug },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setSourcesList(Array.isArray(data) ? data : []))
      .catch(() => setSourcesList([]));
  }, [workspaceSlug, role]);

  // Fetch Feed Articles
  const fetchArticles = useCallback(
    async (cursor?: string, append = false) => {
      setLoading(true);
      setError(null);
      try {
        const queryParams = new URLSearchParams();
        if (selectedSource) queryParams.set('sourceId', selectedSource);
        if (selectedCategory) queryParams.set('category', selectedCategory);
        if (selectedRisk) queryParams.set('riskLevel', selectedRisk);
        if (search) queryParams.set('q', search);
        if (cursor) queryParams.set('cursor', cursor);

        const res = await fetch(
          `${apiUrl}/api/v1/workspaces/${workspaceSlug}/articles?${queryParams.toString()}`,
          {
            headers: { 'x-user-role': role, 'x-workspace-id': workspaceSlug },
          }
        );

        if (!res.ok) {
          const msg = await parseResponseError(res, 'Không thể tải danh sách bài viết');
          throw new Error(msg);
        }

        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.data || data.items || []);
        setArticles((prev) => (append ? [...prev, ...items] : items));
        setNextCursor(data.nextCursor || null);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [workspaceSlug, selectedSource, selectedCategory, selectedRisk, search, role]
  );

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  // Fetch article detail
  const handleOpenDetail = async (id: string) => {
    setSelectedArticleId(id);
    setDetailLoading(true);
    setArticleDetail(null);
    try {
      const res = await fetch(`${apiUrl}/api/v1/workspaces/${workspaceSlug}/articles/${id}`, {
        headers: { 'x-user-role': role, 'x-workspace-id': workspaceSlug },
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, 'Không thể tải chi tiết bài viết');
        throw new Error(msg);
      }
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      setArticleDetail(data);
    } catch (e: any) {
      alert(e.message);
      setSelectedArticleId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRewrite = async (id: string) => {
    setCreatingDraftId(id);
    try {
      const res = await fetch(`${apiUrl}/api/v1/workspaces/${workspaceSlug}/drafts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': role,
          'x-workspace-id': workspaceSlug,
          'x-user-id': 'mock-default-user-id',
        },
        body: JSON.stringify({ articleId: id }),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, 'Tạo bản nháp thất bại');
        throw new Error(msg);
      }
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      setSelectedArticleId(null);
      // Redirect to the newly created draft details page
      router.push(`/app/${workspaceSlug}/drafts/${data.id}`);
    } catch (e: any) {
      alert(e.message);
      setCreatingDraftId(null);
    }
  };

  const isReadonly = role === 'VIEWER';

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-zinc-800/40 pb-5">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-accent-400">Tin Tức Thu Thập</p>
          <h1 className="font-display italic text-2xl font-bold text-zinc-100 tracking-tight">Luồng tin tức</h1>
          <p className="text-xs text-zinc-500 mt-1">Danh sách tin tức tự động bóc tách từ các trang báo & RSS feed.</p>
        </div>

        {/* Role Switcher */}
        <div className="flex items-center space-x-2 bg-surface-raised border border-zinc-800/60 rounded-xl px-3 py-1.5 self-start md:self-auto">
          <span className="text-[10px] uppercase font-bold text-zinc-500">Vai trò:</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
            className="bg-transparent text-xs font-semibold text-accent-400 focus:outline-none cursor-pointer"
          >
            <option value="OWNER">OWNER (Quản trị)</option>
            <option value="EDITOR">EDITOR (Biên tập)</option>
            <option value="VIEWER">VIEWER (Chỉ xem)</option>
          </select>
        </div>
      </div>

      {/* Filter Panel */}
      <div className="p-4 rounded-xl bg-surface-raised border border-zinc-800/50 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Tìm kiếm</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nhập từ khóa tiêu đề..."
            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs focus:outline-none focus:border-accent-500 text-zinc-100 placeholder:text-zinc-600"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Nguồn tin</label>
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs focus:outline-none focus:border-accent-500 text-zinc-100"
          >
            <option value="">Tất cả nguồn tin</option>
            {sourcesList.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Chuyên mục</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs focus:outline-none focus:border-accent-500 text-zinc-100"
          >
            <option value="">Tất cả chuyên mục</option>
            <option value="football">Bóng đá / Football</option>
            <option value="sports">Thể thao</option>
            <option value="general">Tổng hợp</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Mức rủi ro</label>
          <select
            value={selectedRisk}
            onChange={(e) => setSelectedRisk(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs focus:outline-none focus:border-accent-500 text-zinc-100"
          >
            <option value="">Tất cả rủi ro</option>
            <option value="LOW">LOW (Bài mới / An toàn)</option>
            <option value="MEDIUM">MEDIUM (Trùng lặp nhẹ)</option>
            <option value="HIGH">HIGH (Bị trùng nặng)</option>
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={() => {
              setSelectedSource('');
              setSelectedCategory('');
              setSelectedRisk('');
              setSearch('');
            }}
            className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-xs rounded-lg transition"
          >
            Xóa bộ lọc
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-zinc-500 hover:text-zinc-300">✕</button>
        </div>
      )}

      {/* Articles Feed List */}
      <div className="space-y-3">
        {articles.length === 0 && !loading ? (
          <div className="text-center py-16 rounded-xl bg-surface-raised border border-zinc-800/40">
            <h3 className="text-sm font-bold text-zinc-300">Không tìm thấy bài viết nào</h3>
            <p className="text-xs text-zinc-500 mt-1">Hãy quét thêm nguồn tin cấp hoặc xóa bộ lọc để xem toàn bộ tin tức.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5">
            {articles.map((article) => {
              const clusterInfo = article.clusterArticles?.[0];
              const isDuplicate = article.riskLevel === 'MEDIUM';

              return (
                <div
                  key={article.id}
                  className={`p-5 rounded-xl bg-surface-raised border transition-all duration-200 hover:border-zinc-700/60 ${
                    isDuplicate ? 'border-amber-500/30' : 'border-zinc-800/60'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      {/* Meta badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-accent-500/10 text-accent-400 border border-accent-500/20">
                          {article.source.attributionName}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-400">
                          {article.category}
                        </span>
                        {isDuplicate && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Khớp trùng lặp
                          </span>
                        )}
                        {clusterInfo && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                            Chủ đề: {clusterInfo.cluster.canonicalTopic}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3
                        onClick={() => handleOpenDetail(article.id)}
                        className="text-base font-bold text-zinc-100 hover:text-accent-400 cursor-pointer transition line-clamp-2 leading-snug"
                      >
                        {decodeHtml(article.title)}
                      </h3>

                      {/* Excerpt */}
                      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed font-light">
                        {decodeHtml(article.contentExcerpt || article.summary || 'Không có bản tóm tắt nội dung...')}
                      </p>

                      {/* Footnotes */}
                      <div className="flex flex-wrap items-center gap-3 pt-1 text-[10px] text-zinc-500 font-mono">
                        <span>Đăng: {new Date(article.publishedAt).toLocaleString('vi-VN')}</span>
                        <span>•</span>
                        <span>Thu thập: {new Date(article.discoveredAt).toLocaleString('vi-VN')}</span>
                        {article.author && <span>• Tác giả: {article.author}</span>}
                      </div>
                    </div>

                    {/* Direct Action Buttons */}
                    <div className="flex md:flex-col items-stretch gap-2 shrink-0 self-end md:self-center">
                      {!isReadonly && (
                        <button
                          onClick={() => handleRewrite(article.id)}
                          disabled={creatingDraftId === article.id}
                          className="px-3.5 py-2 bg-gradient-to-r from-accent-600 to-emerald-600 hover:from-accent-500 hover:to-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {creatingDraftId === article.id ? (
                            <>
                              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Đang tạo...</span>
                            </>
                          ) : (
                            <>
                              <span>⚡</span>
                              <span>Tạo bản nháp AI</span>
                            </>
                          )}
                        </button>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenDetail(article.id)}
                          className="flex-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition text-center"
                        >
                          Xem chi tiết
                        </button>
                        <a
                          href={article.originalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg text-xs font-medium transition border border-zinc-800"
                          title="Đọc trang báo gốc"
                        >
                          ↗️ Nguồn
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Load More */}
        {nextCursor && (
          <div className="text-center pt-4">
            <button
              onClick={() => fetchArticles(nextCursor, true)}
              disabled={loading}
              className="px-6 py-2 bg-surface-raised hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded-lg text-xs font-semibold transition disabled:opacity-50"
            >
              {loading ? 'Đang tải thêm...' : 'Tải thêm tin tức'}
            </button>
          </div>
        )}
      </div>

      {/* High-contrast Article Details Modal */}
      {selectedArticleId && typeof document !== 'undefined' && createPortal(
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedArticleId(null);
          }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[99999] flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="bg-surface-raised border border-zinc-700/80 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col z-[100000]">
            {/* Modal Header */}
            <div className="p-4 px-6 border-b border-zinc-800 flex items-center justify-between bg-surface-sunken">
              <span className="text-xs font-bold text-accent-400 uppercase tracking-wider">Chi tiết bài viết gốc</span>
              <button
                onClick={() => setSelectedArticleId(null)}
                className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-5">
              {detailLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-zinc-400">
                  <div className="w-8 h-8 border-2 border-accent-500/30 border-t-accent-500 rounded-full animate-spin" />
                  <span className="text-xs font-medium">Đang tải chi tiết tin tức...</span>
                </div>
              ) : articleDetail ? (
                <>
                  <div className="space-y-2">
                    <h2 className="text-lg font-bold text-zinc-100 leading-snug">{decodeHtml(articleDetail.title)}</h2>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded font-bold bg-accent-500/10 text-accent-400 border border-accent-500/20">
                        Nguồn: {articleDetail.source.attributionName} ({articleDetail.source.domain})
                      </span>
                      <span className="px-2 py-0.5 rounded font-bold bg-zinc-800 text-zinc-400">
                        Chuyên mục: {articleDetail.category}
                      </span>
                    </div>
                  </div>

                  {articleDetail.imageUrl && (
                    <div className="relative w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 max-h-[260px]">
                      <img
                        src={articleDetail.imageUrl}
                        alt={articleDetail.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Nội dung trích xuất sạch</span>
                    <p className="text-xs text-zinc-300 leading-relaxed font-light whitespace-pre-wrap">
                      {decodeHtml(articleDetail.contentExcerpt || articleDetail.summary || 'Không thể bóc tách nội dung chi tiết cho bài viết này.')}
                    </p>
                  </div>

                  {/* Footer Action Bar */}
                  <div className="pt-4 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                    <a
                      href={articleDetail.originalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-accent-400 hover:underline flex items-center gap-1"
                    >
                      <span>↗️ Đọc bài viết gốc trên {articleDetail.source.domain}</span>
                    </a>

                    {!isReadonly && (
                      <button
                        onClick={() => handleRewrite(articleDetail.id)}
                        disabled={creatingDraftId === articleDetail.id}
                        className="px-4 py-2 bg-gradient-to-r from-accent-600 to-emerald-600 hover:from-accent-500 hover:to-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-md disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {creatingDraftId === articleDetail.id ? 'Đang khởi tạo...' : '⚡ Tạo bản nháp AI ngay'}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-xs text-zinc-500">Không tải được thông tin bài viết.</div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
