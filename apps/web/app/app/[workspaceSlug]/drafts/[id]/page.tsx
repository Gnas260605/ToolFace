/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

// Unicode bold formatter for Facebook
function toUnicodeBold(str: string): string {
  return str.replace(/[A-Za-z0-9]/g, (char) => {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1d5d4 + (code - 65));
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1d5ee + (code - 97));
    if (code >= 48 && code <= 57) return String.fromCodePoint(0x1d7ec + (code - 48));
    return char;
  });
}

// Status config
const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  GENERATING:        { label: 'Đang tạo nội dung',   dot: 'bg-amber-400', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  DRAFT:             { label: 'Bản nháp',             dot: 'bg-zinc-500',   badge: 'bg-zinc-800/60 text-zinc-400 border-zinc-700/40' },
  READY_FOR_REVIEW:  { label: 'Sẵn sàng để duyệt',   dot: 'bg-sky-400',    badge: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  CHANGES_REQUESTED: { label: 'Yêu cầu chỉnh sửa',   dot: 'bg-orange-400', badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  APPROVED:          { label: 'Đã duyệt',             dot: 'bg-emerald-400',badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  ARCHIVED:          { label: 'Đã lưu trữ',           dot: 'bg-zinc-600',   badge: 'bg-zinc-800/40 text-zinc-500 border-zinc-700/20' },
  GENERATION_FAILED: { label: 'Tạo thất bại',        dot: 'bg-rose-500',   badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
};

interface DraftVersion {
  id: string;
  versionNumber: number;
  headline: string;
  hook: string;
  body: string;
  whyItMatters: string;
  discussionQuestion: string | null;
  hashtagsJson: string[];
  attributionLine: string;
  recommendedLink: string | null;
  contentType: string;
  similarityScore: number | null;
  riskFlagsJson: string[];
  verificationJson: VerificationReport | null;
  createdByPlain: string;
  createdAt: string;
}

interface VerificationReport {
  passed: boolean;
  similarityScore: number;
  riskLevel: string;
  blockingErrors: string[];
  warnings: string[];
  riskFlags: string[];
  quotedWordCount: number;
  forbiddenPhrasesFound: string[];
  checkedClaimsCount: number;
}

interface DraftReview {
  id: string;
  reviewerUserId: string;
  decision: string;
  comment: string;
  createdAt: string;
}

interface Draft {
  id: string;
  status: string;
  primaryArticleId: string | null;
  clusterId: string | null;
  createdAt: string;
  updatedAt: string;
  brandProfile: { name: string; language: string };
  versions: DraftVersion[];
  reviews: DraftReview[];
}

export default function DraftEditorPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.workspaceSlug as string;
  const draftId = params.id as string;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeVersionIdx, setActiveVersionIdx] = useState(0);
  const [activePanel, setActivePanel] = useState<'source' | 'editor' | 'preview' | 'verification'>('editor');

  // AI Assistant states
  const [aiGenerating, setAiGenerating] = useState(false);
  const [suggestedHeadlines, setSuggestedHeadlines] = useState<string[]>([]);
  const [showAiModal, setShowAiModal] = useState(false);

  // Publish / Schedule states
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishType, setPublishType] = useState<'IMMEDIATE' | 'SCHEDULED'>('IMMEDIATE');
  const [selectedPageId, setSelectedPageId] = useState('');
  const [publicationType, setPublicationType] = useState('LINK');
  const [localDateTime, setLocalDateTime] = useState('');
  const [timezone, setTimezone] = useState('Asia/Ho_Chi_Minh');
  const [publishing, setPublishing] = useState(false);
  const [facebookPages, setFacebookPages] = useState<{ id: string; pageName: string }[]>([]);

  useEffect(() => {
    if (draft?.status === 'APPROVED') {
      fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/facebook/pages`, {
        headers: { 'x-user-role': 'OWNER', 'x-workspace-id': workspaceId },
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          setFacebookPages(data);
          if (data.length > 0) {
            setSelectedPageId(data[0].id);
          }
        })
        .catch(() => {});
    }
  }, [draft?.status, workspaceId]);

  // Editor form state
  const [form, setForm] = useState({
    headline: '',
    hook: '',
    body: '',
    whyItMatters: '',
    discussionQuestion: '',
    hashtags: '',
    attributionLine: '',
    recommendedLink: '',
    contentType: 'FACEBOOK_POST',
    versionNumber: 0,
  });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDraft = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/drafts/${draftId}`, {
        headers: { 'x-user-role': 'OWNER', 'x-workspace-id': workspaceId },
      });
      if (!res.ok) throw new Error('Không tải được bản nháp');
      const data: Draft = await res.json();
      setDraft(data);

      const latest = data.versions[0];
      if (latest) {
        setForm({
          headline: latest.headline,
          hook: latest.hook,
          body: latest.body,
          whyItMatters: latest.whyItMatters,
          discussionQuestion: latest.discussionQuestion || '',
          hashtags: (latest.hashtagsJson || []).join(', '),
          attributionLine: latest.attributionLine,
          recommendedLink: latest.recommendedLink || '',
          contentType: latest.contentType,
          versionNumber: latest.versionNumber,
        });
      }

      return data;
    } catch (e: unknown) {
      setError(getErrMsg(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, [workspaceId, draftId]);

  useEffect(() => {
    loadDraft().then((data) => {
      if (data?.status === 'GENERATING') {
        pollRef.current = setInterval(async () => {
          const updated = await loadDraft();
          if (updated?.status !== 'GENERATING' && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 4000);
      }
    });

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadDraft]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // ---- Retry AI Generation ----
  const handleRetry = async () => {
    if (!draft) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/drafts/${draftId}/retry`, {
        method: 'POST',
        headers: { 'x-user-role': 'OWNER', 'x-workspace-id': workspaceId },
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, 'Thử lại thất bại');
        throw new Error(msg);
      }
      showSuccess('Đã gửi lại yêu cầu tạo bài với AI!');
      await loadDraft();
    } catch (e: unknown) {
      setError(getErrMsg(e));
    } finally {
      setLoading(false);
    }
  };

  // ---- Save (PATCH) ----
  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/drafts/${draftId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'OWNER',
          'x-workspace-id': workspaceId,
        },
        body: JSON.stringify({
          ...form,
          hashtags: form.hashtags.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, 'Lưu thất bại');
        throw new Error(msg);
      }
      showSuccess('Đã lưu bản nháp ✓');
      await loadDraft();
    } catch (e: unknown) {
      setError(getErrMsg(e));
    } finally {
      setSaving(false);
    }
  };

  // ---- Submit for review ----
  const handleSubmit = async () => {
    if (!draft) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/drafts/${draftId}/submit`, {
        method: 'POST',
        headers: { 'x-user-role': 'OWNER', 'x-workspace-id': workspaceId },
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, 'Gửi duyệt thất bại');
        throw new Error(msg);
      }
      showSuccess('Đã gửi bài để duyệt');
      await loadDraft();
    } catch (e: unknown) {
      setError(getErrMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Approve ----
  const handleApprove = async () => {
    if (!draft) return;
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/drafts/${draftId}/approve`, {
        method: 'POST',
        headers: { 'x-user-role': 'OWNER', 'x-workspace-id': workspaceId },
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, 'Phê duyệt thất bại');
        throw new Error(msg);
      }
      showSuccess('Đã phê duyệt bài viết ✓');
      await loadDraft();
    } catch (e: unknown) {
      setError(getErrMsg(e));
    } finally {
      setApproving(false);
    }
  };

  const handlePublishOrSchedule = async () => {
    if (!draft || !latestVersion) return;
    if (!selectedPageId) {
      setError('Vui lòng chọn trang Facebook để tiếp tục');
      return;
    }
    setPublishing(true);
    setError(null);

    const idempotencyKey = `${workspaceId}:${selectedPageId}:${draftId}:${latestVersion.id}:${publicationType}:${Date.now()}`;

    try {
      if (publishType === 'IMMEDIATE') {
        const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/drafts/${draftId}/publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': 'OWNER',
            'x-workspace-id': workspaceId,
            'idempotency-key': idempotencyKey,
          },
          body: JSON.stringify({
            draftVersionId: latestVersion.id,
            pageConnectionId: selectedPageId,
            publicationType,
            confirmed: true,
          }),
        });

        if (!res.ok) {
          const msg = await parseResponseError(res, 'Đăng bài thất bại');
          throw new Error(msg);
        }

        showSuccess('Đã đưa bài viết vào hàng đợi đăng ngay!');
      } else {
        if (!localDateTime) {
          throw new Error('Vui lòng chọn thời điểm lên lịch đăng bài');
        }
        const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/drafts/${draftId}/schedule`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': 'OWNER',
            'x-workspace-id': workspaceId,
            'idempotency-key': idempotencyKey,
          },
          body: JSON.stringify({
            draftVersionId: latestVersion.id,
            pageConnectionId: selectedPageId,
            publicationType,
            localPublishDateTime: localDateTime,
            timezone,
            confirmed: true,
          }),
        });

        if (!res.ok) {
          const msg = await parseResponseError(res, 'Lên lịch thất bại');
          throw new Error(msg);
        }

        showSuccess('Đã lên lịch xuất bản bài viết thành công!');
      }
      setShowPublishModal(false);
      await loadDraft();
    } catch (e: unknown) {
      setError(getErrMsg(e));
    } finally {
      setPublishing(false);
    }
  };

  const handleQuickPublish = async () => {
    if (!draft || !latestVersion) return;
    setPublishing(true);
    setError(null);
    const idempotencyKey = `quick-pub-${workspaceId}-${draftId}-${latestVersion.id}-${Date.now()}`;
    try {
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/drafts/${draftId}/quick-publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'OWNER',
          'x-workspace-id': workspaceId,
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          confirmed: true,
          publicationType: 'LINK',
        }),
      });

      if (!res.ok) {
        const msg = await parseResponseError(res, 'Đăng nhanh thất bại');
        throw new Error(msg);
      }

      showSuccess('Đã duyệt và đưa bài viết vào hàng đợi xuất bản thành công! ⚡');
      await loadDraft();
    } catch (e: unknown) {
      setError(getErrMsg(e));
    } finally {
      setPublishing(false);
    }
  };

  // ---- Advanced AI Features ----
  const handleAiSuggestHeadlines = async () => {
    setAiGenerating(true);
    setShowAiModal(true);
    setTimeout(() => {
      const base = form.headline || 'Tiêu đề bài viết';
      setSuggestedHeadlines([
        `🔥 HOT: ${base}`,
        `📍 Nóng nhất hôm nay: ${base}`,
        `⚡ ĐỘT PHÁ: ${base} — Những điều bạn cần biết`,
        `👉 Chi tiết: ${base}`,
        `💡 Phân tích sâu: ${base}`
      ]);
      setAiGenerating(false);
    }, 800);
  };

  const handleAiAutoHashtags = () => {
    const text = `${form.headline} ${form.body}`;
    const words = text.split(/\s+/).filter(w => w.length > 3 && !['những', 'chính', 'người', 'trong', 'được'].includes(w.toLowerCase()));
    const uniqueTags = Array.from(new Set(words.slice(0, 5))).map(w => `#${w.replace(/[^a-zA-Z0-9À-ỹ]/g, '')}`);
    setForm(prev => ({
      ...prev,
      hashtags: uniqueTags.join(', ')
    }));
    showSuccess('Đã tự động tạo Hashtags từ khóa! ✨');
  };

  const handleInsertEmoji = (emoji: string) => {
    setForm(prev => ({
      ...prev,
      body: prev.body + ` ${emoji} `
    }));
  };

  const handleBoldHeadline = () => {
    if (!form.headline) return;
    setForm(prev => ({
      ...prev,
      headline: toUnicodeBold(prev.headline)
    }));
    showSuccess('Đã định dạng Tiêu đề đậm Unicode cho Facebook! 𝝝');
  };

  const handleCopyFormattedFacebook = () => {
    const formatted = `${form.headline}\n\n${form.hook}\n\n${form.body}\n\n${form.whyItMatters ? '📌 TẠI SAO BẠN CẦN QUAN TÂM?\n' + form.whyItMatters + '\n\n' : ''}${form.discussionQuestion ? '💬 ' + form.discussionQuestion + '\n\n' : ''}${form.hashtags}\n\nNguồn: ${form.attributionLine}`;
    navigator.clipboard.writeText(formatted);
    showSuccess('Đã sao chép toàn bộ văn bản Facebook vào khay nhớ tạm! 📋');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent-500/30 border-t-accent-500 rounded-full animate-spin" />
          <span className="text-sm">Đang tải bản nháp...</span>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
        Không tìm thấy bản nháp.
      </div>
    );
  }

  const latestVersion = draft.versions[activeVersionIdx];
  const verification: VerificationReport | null = latestVersion?.verificationJson ?? null;
  const statusCfg = STATUS_CONFIG[draft.status] ?? { label: draft.status, dot: 'bg-zinc-500', badge: 'bg-zinc-800/40 text-zinc-400 border-zinc-700/20' };
  const isEditable = ['DRAFT', 'CHANGES_REQUESTED', 'READY_FOR_REVIEW'].includes(draft.status);
  const isGenerating = draft.status === 'GENERATING';

  // Analytics calculation
  const totalWords = (form.headline + ' ' + form.hook + ' ' + form.body).split(/\s+/).filter(Boolean).length;
  const totalChars = (form.headline + form.hook + form.body).length;
  const readTimeMin = Math.max(1, Math.ceil(totalWords / 200));

  return (
    <div className="flex flex-col h-full gap-0 -mx-6 -mt-8 min-h-screen">
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-surface-raised border-b border-zinc-800/40 shrink-0 sticky top-14 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/app/${workspaceId}/drafts`)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-zinc-800/60"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${statusCfg.badge}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} ${isGenerating ? 'animate-pulse' : ''}`} />
            {statusCfg.label}
          </div>
          {draft.brandProfile && (
            <span className="text-xs text-zinc-500 hidden sm:block">Thương hiệu: <strong className="text-zinc-300">{draft.brandProfile.name}</strong></span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyFormattedFacebook}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-all border border-zinc-700/50 flex items-center gap-1.5"
            title="Sao chép toàn bộ bài viết để đăng"
          >
            <span>📋</span> Copy FB
          </button>

          {isEditable && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-all border border-zinc-700/50 disabled:opacity-50"
            >
              {saving ? 'Đang lưu...' : 'Lưu nháp'}
            </button>
          )}

          {draft.status === 'DRAFT' || draft.status === 'CHANGES_REQUESTED' ? (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-all disabled:opacity-50"
            >
              {submitting ? 'Đang gửi...' : 'Gửi duyệt'}
            </button>
          ) : null}

          {draft.status === 'READY_FOR_REVIEW' && (
            <button
              onClick={handleApprove}
              disabled={approving}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all disabled:opacity-50"
            >
              {approving ? 'Đang duyệt...' : 'Phê duyệt ✓'}
            </button>
          )}

          {['DRAFT', 'CHANGES_REQUESTED', 'READY_FOR_REVIEW'].includes(draft.status) && (
            <button
              onClick={handleQuickPublish}
              disabled={publishing}
              className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 text-white text-xs font-bold hover:from-amber-500 hover:to-orange-500 transition-all shadow-md shadow-orange-600/10 disabled:opacity-50 flex items-center gap-1.5"
            >
              {publishing ? 'Đang đăng...' : 'Đăng nhanh ⚡'}
            </button>
          )}

          {draft.status === 'APPROVED' && (
            <button
              onClick={() => setShowPublishModal(true)}
              className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-accent-600 to-emerald-600 text-white text-xs font-bold hover:from-accent-500 hover:to-emerald-500 transition-all shadow-md shadow-accent-600/10"
            >
              Lên lịch / Đăng bài &rarr;
            </button>
          )}
        </div>
      </div>

      {/* ── Toast Messages ── */}
      {(error || successMsg) && (
        <div className={`mx-6 mt-3 px-4 py-2.5 rounded-xl text-xs border shrink-0 flex items-center justify-between ${
          error
            ? 'bg-rose-950/30 border-rose-500/30 text-rose-300'
            : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
        }`}>
          <span>{error || successMsg}</span>
          <button onClick={() => { setError(null); setSuccessMsg(null); }} className="text-zinc-500 hover:text-zinc-300">✕</button>
        </div>
      )}

      {/* ── Generating State ── */}
      {isGenerating && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-zinc-400 py-20">
          <div className="w-12 h-12 border-2 border-accent-500/30 border-t-accent-500 rounded-full animate-spin" />
          <div className="text-center">
            <p className="text-sm font-medium text-zinc-300">Đang trích xuất dữ kiện và tạo nội dung AI...</p>
            <p className="text-xs text-zinc-600 mt-1">Thường mất 10–30 giây. Trang sẽ tự động cập nhật.</p>
          </div>
        </div>
      )}

      {/* ── Failed / Empty State ── */}
      {!isGenerating && (!latestVersion || draft.status === 'GENERATION_FAILED') && (
        <div className="flex flex-col items-center justify-center flex-1 gap-5 text-zinc-400 py-16 px-6 max-w-xl mx-auto text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 text-3xl shadow-inner">
            ⚠️
          </div>
          <div className="space-y-2">
            <h3 className="text-base font-bold text-zinc-100">Tạo nội dung từ AI không thành công</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Hệ thống AI (Google Gemini) gặp sự cố khi xử lý hoặc đã chạm giới hạn tần suất gọi API (Rate Limit). Do dữ liệu giả (Mock) đã bị loại bỏ hoàn toàn, bài nháp không chứa nội dung mẫu.
            </p>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={handleRetry}
              className="px-4 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold transition-all shadow-lg shadow-accent-600/20 flex items-center gap-2"
            >
              <span>🔄</span> Thử tạo lại với AI
            </button>
            <button
              onClick={() => router.push(`/app/${workspaceId}/articles`)}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-all border border-zinc-700/50"
            >
              Quay lại danh sách bài viết
            </button>
          </div>
        </div>
      )}

      {/* ── Main Layout ── */}
      {!isGenerating && latestVersion && (
        <>
          {/* Navigation Bar for View Modes */}
          <div className="flex items-center justify-between px-6 py-2.5 border-b border-zinc-800/30 bg-surface-sunken">
            <div className="flex items-center gap-1">
              {(['editor', 'preview', 'source', 'verification'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setActivePanel(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activePanel === p
                      ? 'bg-zinc-800 text-accent-300 border border-zinc-700/50'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
                  }`}
                >
                  {p === 'editor' && '✍️ Soạn thảo'}
                  {p === 'preview' && '👁️ Live Preview Facebook'}
                  {p === 'source' && '📄 Nguồn tin'}
                  {p === 'verification' && '🛡️ Kiểm tra An toàn'}
                </button>
              ))}
            </div>

            {/* Metrics Bar */}
            <div className="hidden md:flex items-center gap-4 text-[11px] text-zinc-500 font-mono">
              <span>{totalWords} từ</span>
              <span>•</span>
              <span>{totalChars} ký tự</span>
              <span>•</span>
              <span>~{readTimeMin} phút đọc</span>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* ── VIEW 1: EDITOR PANEL ── */}
            {(activePanel === 'editor' || activePanel === 'preview') && (
              <div className={`flex-1 flex flex-col lg:flex-row overflow-hidden ${activePanel === 'preview' ? 'lg:flex' : ''}`}>
                {/* Main Form Fields */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* AI Toolbar Box */}
                  <div className="p-4 rounded-xl bg-accent-950/20 border border-accent-500/20 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-accent-400 animate-pulse" />
                      <span className="text-xs font-semibold text-accent-400">Trợ lý Biên tập AI</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handleAiSuggestHeadlines}
                        className="px-2.5 py-1 rounded-md bg-accent-500/10 hover:bg-accent-500/20 text-accent-300 text-xs font-medium border border-accent-500/30 transition-colors"
                      >
                        💡 Gợi ý tiêu đề
                      </button>
                      <button
                        onClick={handleAiAutoHashtags}
                        className="px-2.5 py-1 rounded-md bg-accent-500/10 hover:bg-accent-500/20 text-accent-300 text-xs font-medium border border-accent-500/30 transition-colors"
                      >
                        🏷️ Tự động Hashtags
                      </button>
                      <button
                        onClick={handleBoldHeadline}
                        className="px-2.5 py-1 rounded-md bg-accent-500/10 hover:bg-accent-500/20 text-accent-300 text-xs font-medium border border-accent-500/30 transition-colors"
                      >
                        𝝝 In đậm Unicode FB
                      </button>
                    </div>
                  </div>

                  {/* Headline */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-400 tracking-wide flex items-center justify-between">
                      <span>Tiêu đề bài viết</span>
                      <span className="text-[10px] text-zinc-600 font-mono">{form.headline.length} ký tự</span>
                    </label>
                    <input
                      type="text"
                      disabled={!isEditable}
                      value={form.headline}
                      onChange={(e) => setForm({ ...form, headline: e.target.value })}
                      placeholder="Nhập tiêu đề hấp dẫn..."
                      className="w-full rounded-lg bg-zinc-900/80 border border-zinc-800/80 px-3.5 py-2.5 text-sm font-bold text-zinc-100 placeholder:text-zinc-600 hover:border-zinc-700 focus:border-accent-500/50 focus:outline-none"
                    />
                  </div>

                  {/* Hook */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-zinc-400 tracking-wide">
                      Mở đầu (Hook gây chú ý)
                    </label>
                    <textarea
                      rows={2}
                      disabled={!isEditable}
                      value={form.hook}
                      onChange={(e) => setForm({ ...form, hook: e.target.value })}
                      placeholder="Câu mở đầu giật gân, thu hút độc giả dừng lướt feed..."
                      className="w-full rounded-lg bg-zinc-900/80 border border-zinc-800/80 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 hover:border-zinc-700 focus:border-accent-500/50 focus:outline-none resize-none"
                    />
                  </div>

                  {/* Body with Emoji Quick Toolbar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-medium text-zinc-400 tracking-wide">
                        Thân bài nội dung chính
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-zinc-600 mr-2">Chèn nhanh:</span>
                        {['🔥', '📢', '📌', '⚡', '👇', '✅', '👉'].map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => handleInsertEmoji(emoji)}
                            className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-xs flex items-center justify-center transition-colors"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      rows={7}
                      disabled={!isEditable}
                      value={form.body}
                      onChange={(e) => setForm({ ...form, body: e.target.value })}
                      placeholder="Nội dung bài viết trình bày chi tiết..."
                      className="w-full rounded-lg bg-zinc-900/80 border border-zinc-800/80 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 hover:border-zinc-700 focus:border-accent-500/50 focus:outline-none"
                    />
                  </div>

                  {/* Grid 2 cols for Why it matters & Discussion question */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-zinc-400 tracking-wide">
                        Tại sao quan trọng (Why it matters)
                      </label>
                      <textarea
                        rows={3}
                        disabled={!isEditable}
                        value={form.whyItMatters}
                        onChange={(e) => setForm({ ...form, whyItMatters: e.target.value })}
                        placeholder="Giải thích tác động của tin tức..."
                        className="w-full rounded-lg bg-zinc-900/80 border border-zinc-800/80 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 hover:border-zinc-700 focus:border-accent-500/50 focus:outline-none resize-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-zinc-400 tracking-wide">
                        Câu hỏi thảo luận (Kích tương tác)
                      </label>
                      <textarea
                        rows={3}
                        disabled={!isEditable}
                        value={form.discussionQuestion}
                        onChange={(e) => setForm({ ...form, discussionQuestion: e.target.value })}
                        placeholder="Bạn nghĩ sao về vấn đề này? Hãy bình luận bên dưới..."
                        className="w-full rounded-lg bg-zinc-900/80 border border-zinc-800/80 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 hover:border-zinc-700 focus:border-accent-500/50 focus:outline-none resize-none"
                      />
                    </div>
                  </div>

                  {/* Hashtags & Source */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-zinc-400 tracking-wide">
                        Hashtags (Phân cách bằng dấu phẩy)
                      </label>
                      <input
                        type="text"
                        disabled={!isEditable}
                        value={form.hashtags}
                        onChange={(e) => setForm({ ...form, hashtags: e.target.value })}
                        placeholder="#TinTuc, #ThoiSu, #Facebook"
                        className="w-full rounded-lg bg-zinc-900/80 border border-zinc-800/80 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 hover:border-zinc-700 focus:border-accent-500/50 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-zinc-400 tracking-wide">
                        Nguồn trích dẫn / Attribution
                      </label>
                      <input
                        type="text"
                        disabled={!isEditable}
                        value={form.attributionLine}
                        onChange={(e) => setForm({ ...form, attributionLine: e.target.value })}
                        placeholder="Theo Báo Tuổi Trẻ"
                        className="w-full rounded-lg bg-zinc-900/80 border border-zinc-800/80 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 hover:border-zinc-700 focus:border-accent-500/50 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* ── LIVE FACEBOOK PREVIEW COLUMN ── */}
                <div className="w-full lg:w-[420px] bg-surface-sunken border-l border-zinc-800/40 p-6 overflow-y-auto shrink-0">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-zinc-500 tracking-[0.15em] uppercase">Live Facebook Preview</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">Mobile Feed UI</span>
                  </div>

                  {/* Facebook Mock Card */}
                  <div className="rounded-xl border border-zinc-800 bg-[#18191a] text-zinc-100 shadow-2xl overflow-hidden font-sans text-xs">
                    {/* Header */}
                    <div className="p-3 flex items-center justify-between border-b border-zinc-800/40">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent-500 to-emerald-600 flex items-center justify-center text-white font-bold text-xs">
                          TF
                        </div>
                        <div>
                          <p className="font-semibold text-zinc-200 text-xs">Tin Tức Thú Vị</p>
                          <p className="text-[10px] text-zinc-400 flex items-center gap-1">
                            <span>Vừa xong</span>
                            <span>•</span>
                            <span>🌐</span>
                          </p>
                        </div>
                      </div>
                      <span className="text-zinc-500 font-bold">•••</span>
                    </div>

                    {/* Post Content */}
                    <div className="p-3 space-y-2 whitespace-pre-wrap leading-relaxed text-zinc-200">
                      <p className="font-bold text-sm text-white">{form.headline || 'Chưa nhập tiêu đề'}</p>
                      {form.hook && <p className="text-zinc-300 italic">{form.hook}</p>}
                      {form.body && <p className="text-zinc-300">{form.body}</p>}
                      {form.whyItMatters && (
                        <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 text-[11px]">
                          <span className="font-bold text-accent-400">📌 TẠI SAO BẠN CẦN QUAN TÂM?</span>
                          <p className="mt-1 text-zinc-400">{form.whyItMatters}</p>
                        </div>
                      )}
                      {form.discussionQuestion && (
                        <p className="font-medium text-accent-300">💬 {form.discussionQuestion}</p>
                      )}
                      {form.hashtags && (
                        <p className="text-accent-400 font-medium">
                          {form.hashtags.split(',').map(tag => tag.trim().startsWith('#') ? tag.trim() : `#${tag.trim()}`).join(' ')}
                        </p>
                      )}
                      <p className="text-[10px] text-zinc-500">Nguồn: {form.attributionLine || 'Tin tức'}</p>
                    </div>

                    {/* Link Card Preview if recommendedLink exists */}
                    {form.recommendedLink && (
                      <div className="border-t border-b border-zinc-800 bg-zinc-900/40 p-3 flex items-center gap-3">
                        <div className="w-12 h-12 rounded bg-zinc-800 flex items-center justify-center text-zinc-500 text-lg shrink-0">
                          🔗
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase text-zinc-500 font-mono truncate">{form.recommendedLink}</p>
                          <p className="text-xs font-semibold text-zinc-200 truncate">{form.headline}</p>
                        </div>
                      </div>
                    )}

                    {/* Like/Comment Bar */}
                    <div className="p-2.5 border-t border-zinc-800/60 flex items-center justify-around text-[11px] text-zinc-400 font-medium">
                      <span className="flex items-center gap-1 hover:text-zinc-200 cursor-pointer">👍 Thích</span>
                      <span className="flex items-center gap-1 hover:text-zinc-200 cursor-pointer">💬 Bình luận</span>
                      <span className="flex items-center gap-1 hover:text-zinc-200 cursor-pointer">↗️ Chia sẻ</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── VIEW 2: SOURCE PANEL ── */}
            {activePanel === 'source' && (
              <div className="flex-1 p-6 overflow-y-auto space-y-6">
                <div className="rounded-xl border border-zinc-800 bg-surface-raised p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-200">Thông tin bài viết gốc</h3>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-zinc-500">Article ID:</span>
                      <p className="text-zinc-300 font-mono mt-0.5">{draft.primaryArticleId || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-zinc-500">Cluster ID:</span>
                      <p className="text-zinc-300 font-mono mt-0.5">{draft.clusterId || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-surface-raised p-6 space-y-3">
                  <h3 className="text-sm font-semibold text-zinc-200">Lịch sử phiên bản AI</h3>
                  <div className="space-y-2">
                    {draft.versions.map((v, idx) => (
                      <div
                        key={v.id}
                        onClick={() => setActiveVersionIdx(idx)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          idx === activeVersionIdx
                            ? 'bg-accent-500/10 border-accent-500/30 text-zinc-100'
                            : 'bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold">Phiên bản v{v.versionNumber}</span>
                          <span className="text-[10px] text-zinc-500">{new Date(v.createdAt).toLocaleString('vi-VN')}</span>
                        </div>
                        <p className="text-xs text-zinc-300 mt-1 line-clamp-1">{v.headline}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── VIEW 3: VERIFICATION & COMPLIANCE ── */}
            {activePanel === 'verification' && (
              <div className="flex-1 p-6 overflow-y-auto space-y-6">
                <div className="rounded-xl border border-zinc-800 bg-surface-raised p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-200">Báo cáo kiểm duyệt an toàn</h3>
                  {verification ? (
                    <div className="space-y-4 text-xs">
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          verification.passed ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {verification.passed ? '✓ ĐẠT KIỂM DUYỆT' : '✕ CÓ LỖI CẦN SỬA'}
                        </span>
                        <span className="text-zinc-400">Mức rủi ro: <strong className="text-zinc-200">{verification.riskLevel}</strong></span>
                      </div>

                      <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-zinc-900/60 border border-zinc-800 text-center">
                        <div>
                          <span className="text-[10px] text-zinc-500 uppercase">Độ trùng lặp</span>
                          <p className="text-base font-bold text-accent-400 mt-0.5">{Math.round((verification.similarityScore || 0) * 100)}%</p>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 uppercase">Số từ trích dẫn</span>
                          <p className="text-base font-bold text-zinc-200 mt-0.5">{verification.quotedWordCount || 0}</p>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 uppercase">Dữ kiện kiểm tra</span>
                          <p className="text-base font-bold text-sky-400 mt-0.5">{verification.checkedClaimsCount || 0}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">Chưa có báo cáo kiểm duyệt cho phiên bản này.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── AI Headlines Modal ── */}
      {showAiModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface-raised border border-zinc-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <span>💡</span> Gợi ý tiêu đề AI
              </h3>
              <button onClick={() => setShowAiModal(false)} className="text-zinc-500 hover:text-zinc-300">✕</button>
            </div>

            {aiGenerating ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-6 h-6 border-2 border-accent-500/30 border-t-accent-500 rounded-full animate-spin mx-auto" />
                <p className="text-xs text-zinc-400">AI đang sáng tạo các tiêu đề hấp dẫn...</p>
              </div>
            ) : (
              <div className="space-y-2">
                {suggestedHeadlines.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setForm({ ...form, headline: h });
                      setShowAiModal(false);
                      showSuccess('Đã áp dụng tiêu đề AI! ✨');
                    }}
                    className="w-full text-left p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/60 hover:border-accent-500/40 hover:bg-accent-950/20 text-xs text-zinc-200 transition-all font-medium"
                  >
                    {h}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Publish Modal ── */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-surface-raised border border-zinc-800 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100">Xác nhận xuất bản bài viết</h3>
              <button onClick={() => setShowPublishModal(false)} className="text-zinc-500 hover:text-zinc-300">✕</button>
            </div>

            {/* Select Facebook Page */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">Chọn Kênh Fanpage Facebook</label>
              <select
                value={selectedPageId}
                onChange={(e) => setSelectedPageId(e.target.value)}
                className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none"
              >
                {facebookPages.map((p) => (
                  <option key={p.id} value={p.id}>{p.pageName}</option>
                ))}
              </select>
            </div>

            {/* Publish Mode Toggle */}
            <div className="grid grid-cols-2 gap-3 p-1 rounded-xl bg-zinc-900 border border-zinc-800">
              <button
                type="button"
                onClick={() => setPublishType('IMMEDIATE')}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${
                  publishType === 'IMMEDIATE' ? 'bg-accent-600 text-white shadow-sm' : 'text-zinc-400'
                }`}
              >
                Đăng bài ngay
              </button>
              <button
                type="button"
                onClick={() => setPublishType('SCHEDULED')}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${
                  publishType === 'SCHEDULED' ? 'bg-accent-600 text-white shadow-sm' : 'text-zinc-400'
                }`}
              >
                Lên lịch xuất bản
              </button>
            </div>

            {/* Publication Type Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">Định dạng bài đăng Facebook</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPublicationType('LINK')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                    publicationType === 'LINK'
                      ? 'bg-accent-500/10 border-accent-500/40 text-accent-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  🔗 Bài viết kèm Link Card
                </button>
                <button
                  type="button"
                  onClick={() => setPublicationType('TEXT')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                    publicationType === 'TEXT'
                      ? 'bg-accent-500/10 border-accent-500/40 text-accent-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  📝 Bài viết chỉ có Văn bản
                </button>
              </div>
            </div>

            {publishType === 'SCHEDULED' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-400">Thời điểm đăng (Giờ địa phương)</label>
                  <input
                    type="datetime-local"
                    value={localDateTime}
                    onChange={(e) => setLocalDateTime(e.target.value)}
                    className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3.5 py-2.5 text-xs text-zinc-100 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-400">Múi giờ</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3.5 py-2.5 text-xs text-zinc-100 focus:outline-none"
                  >
                    <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (GMT+7)</option>
                    <option value="UTC">UTC (GMT+0)</option>
                  </select>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setShowPublishModal(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium hover:bg-zinc-700"
              >
                Hủy
              </button>
              <button
                onClick={handlePublishOrSchedule}
                disabled={publishing}
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-accent-600 to-emerald-600 hover:from-accent-500 hover:to-emerald-500 text-white text-xs font-bold disabled:opacity-50"
              >
                {publishing ? 'Đang thực thi...' : publishType === 'IMMEDIATE' ? 'Xác nhận Đăng bài' : 'Xác nhận Lên lịch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
