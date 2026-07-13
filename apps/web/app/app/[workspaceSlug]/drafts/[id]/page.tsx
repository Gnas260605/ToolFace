'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function getErrMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------
const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  GENERATING:        { label: 'Đang tạo nội dung',   dot: 'bg-yellow-400', badge: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30' },
  DRAFT:             { label: 'Bản nháp',             dot: 'bg-gray-500',   badge: 'bg-gray-800/40 text-gray-400 border-gray-700/20' },
  READY_FOR_REVIEW:  { label: 'Sẵn sàng để duyệt',   dot: 'bg-blue-400',   badge: 'bg-blue-900/30 text-blue-400 border-blue-700/30' },
  CHANGES_REQUESTED: { label: 'Yêu cầu chỉnh sửa',   dot: 'bg-orange-400', badge: 'bg-orange-900/30 text-orange-400 border-orange-700/30' },
  APPROVED:          { label: 'Đã duyệt',             dot: 'bg-emerald-400',badge: 'bg-emerald-900/30 text-emerald-400 border-emerald-700/30' },
  ARCHIVED:          { label: 'Đã lưu trữ',           dot: 'bg-gray-600',   badge: 'bg-gray-800/30 text-gray-500 border-gray-700/20' },
};

const RISK_LEVEL_CONFIG: Record<string, { label: string; cls: string }> = {
  LOW:  { label: 'Thấp',    cls: 'text-emerald-400 bg-emerald-900/20' },
  MEDIUM: { label: 'Trung bình', cls: 'text-yellow-400 bg-yellow-900/20' },
  HIGH: { label: 'Cao',     cls: 'text-red-400 bg-red-900/20' },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function relTime(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

function SimilarityBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct > 75 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-emerald-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>Độ tương đồng với nguồn</span>
        <span className={pct > 75 ? 'text-red-400' : pct > 50 ? 'text-yellow-400' : 'text-emerald-400'}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
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
  const [activePanel, setActivePanel] = useState<'source' | 'editor' | 'verification'>('editor');

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
      // Poll while GENERATING
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
        const err = await res.json();
        throw new Error(err.message || 'Lưu thất bại');
      }
      showSuccess('Đã lưu bản nháp');
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
        const err = await res.json();
        throw new Error(err.message || 'Gửi duyệt thất bại');
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
        const err = await res.json();
        throw new Error(err.message || 'Phê duyệt thất bại');
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
          const err = await res.json();
          throw new Error(err.message || 'Đăng bài thất bại');
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
          const err = await res.json();
          throw new Error(err.message || 'Lên lịch thất bại');
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          <span className="text-sm">Đang tải bản nháp...</span>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Không tìm thấy bản nháp.
      </div>
    );
  }

  const latestVersion = draft.versions[activeVersionIdx];
  const verification: VerificationReport | null = latestVersion?.verificationJson ?? null;
  const statusCfg = STATUS_CONFIG[draft.status] ?? { label: draft.status, dot: 'bg-gray-500', badge: 'bg-gray-800/40 text-gray-400 border-gray-700/20' };
  const isEditable = ['DRAFT', 'CHANGES_REQUESTED', 'READY_FOR_REVIEW'].includes(draft.status);
  const isGenerating = draft.status === 'GENERATING';

  return (
    <div className="flex flex-col h-full gap-0 -mx-8 -mt-8 min-h-screen">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-[#080d19] border-b border-gray-800/50 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/app/${workspaceId}/drafts`)}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${statusCfg.badge}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} ${isGenerating ? 'animate-pulse' : ''}`} />
            {statusCfg.label}
          </div>
          {draft.brandProfile && (
            <span className="text-xs text-gray-500 hidden sm:block">{draft.brandProfile.name}</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {isEditable && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 text-xs font-medium hover:bg-gray-700 transition-all disabled:opacity-50"
            >
              {saving ? 'Đang lưu...' : 'Lưu nháp'}
            </button>
          )}
          {draft.status === 'DRAFT' || draft.status === 'CHANGES_REQUESTED' ? (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-3 py-1.5 rounded-lg bg-blue-600/80 text-white text-xs font-semibold hover:bg-blue-500/90 transition-all disabled:opacity-50"
            >
              {submitting ? 'Đang gửi...' : 'Gửi duyệt'}
            </button>
          ) : null}
          {draft.status === 'READY_FOR_REVIEW' && (
            <button
              onClick={handleApprove}
              disabled={approving}
              className="px-3 py-1.5 rounded-lg bg-emerald-600/80 text-white text-xs font-semibold hover:bg-emerald-500/90 transition-all disabled:opacity-50"
            >
              {approving ? 'Đang duyệt...' : 'Phê duyệt ✓'}
            </button>
          )}
          {draft.status === 'APPROVED' && (
            <button
              onClick={() => setShowPublishModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-blue-600 text-white text-xs font-bold hover:from-brand-500 hover:to-blue-500 transition-all shadow-md"
            >
              Lên lịch / Đăng bài &rarr;
            </button>
          )}
        </div>
      </div>

      {/* ── Toast messages ── */}
      {(error || successMsg) && (
        <div className={`mx-6 mt-3 px-4 py-2.5 rounded-xl text-sm border shrink-0 ${
          error
            ? 'bg-red-900/30 border-red-700/40 text-red-300'
            : 'bg-emerald-900/30 border-emerald-700/40 text-emerald-300'
        }`}>
          {error || successMsg}
        </div>
      )}

      {/* ── GENERATING state ── */}
      {isGenerating && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-gray-400">
          <div className="w-12 h-12 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-300">Đang trích xuất dữ kiện và tạo nội dung...</p>
            <p className="text-xs text-gray-600 mt-1">Thường mất 10–30 giây. Trang sẽ tự động cập nhật.</p>
          </div>
        </div>
      )}

      {/* ── Three-panel layout ── */}
      {!isGenerating && latestVersion && (
        <>
          {/* Mobile tab switcher */}
          <div className="flex lg:hidden border-b border-gray-800/50 shrink-0">
            {(['source', 'editor', 'verification'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setActivePanel(p)}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  activePanel === p ? 'text-brand-400 border-b-2 border-brand-500' : 'text-gray-500'
                }`}
              >
                {p === 'source' ? 'Nguồn' : p === 'editor' ? 'Soạn thảo' : 'Kiểm tra'}
              </button>
            ))}
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* ── Panel 1: Source Article ── */}
            <div className={`${activePanel === 'source' ? 'flex' : 'hidden'} lg:flex flex-col w-full lg:w-[28%] border-r border-gray-800/50 overflow-y-auto bg-[#080c18]`}>
              <div className="p-4 border-b border-gray-800/30 shrink-0">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Nguồn tham khảo</h2>
              </div>
              <div className="p-4 space-y-4 text-sm">
                <div className="bg-[#0c1323] rounded-xl p-3 space-y-2 border border-gray-800/40">
                  <span className="text-[10px] uppercase text-gray-600 tracking-wider font-semibold">
                    {draft.clusterId ? 'Cụm tin' : 'Bài viết gốc'}
                  </span>
                  <p className="text-xs text-gray-400">
                    {draft.primaryArticleId
                      ? `Article ID: ${draft.primaryArticleId}`
                      : draft.clusterId
                      ? `Cluster ID: ${draft.clusterId}`
                      : 'Không có nguồn được liên kết'}
                  </p>
                </div>

                {/* Version history */}
                <div>
                  <p className="text-[10px] uppercase text-gray-600 font-semibold tracking-wider mb-2">Lịch sử phiên bản</p>
                  <div className="space-y-1.5">
                    {draft.versions.map((v, idx) => (
                      <button
                        key={v.id}
                        onClick={() => setActiveVersionIdx(idx)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                          idx === activeVersionIdx
                            ? 'bg-brand-600/20 text-brand-400 border border-brand-600/30'
                            : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'
                        }`}
                      >
                        <div className="flex justify-between">
                          <span className="font-medium">v{v.versionNumber}</span>
                          <span className="text-gray-600">{v.createdByPlain}</span>
                        </div>
                        <div className="text-[10px] text-gray-600 mt-0.5">{relTime(v.createdAt)}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reviews */}
                {draft.reviews.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase text-gray-600 font-semibold tracking-wider mb-2">Lịch sử duyệt</p>
                    <div className="space-y-2">
                      {draft.reviews.map((r) => (
                        <div key={r.id} className="bg-[#0c1323] rounded-lg p-2.5 border border-gray-800/40 space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className={r.decision === 'APPROVED' ? 'text-emerald-400' : 'text-orange-400'}>
                              {r.decision === 'APPROVED' ? '✓ Phê duyệt' : '↩ Yêu cầu chỉnh sửa'}
                            </span>
                            <span className="text-gray-600">{relTime(r.createdAt)}</span>
                          </div>
                          {r.comment && <p className="text-[11px] text-gray-400">{r.comment}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Panel 2: Editor ── */}
            <div className={`${activePanel === 'editor' ? 'flex' : 'hidden'} lg:flex flex-col flex-1 overflow-y-auto`}>
              <div className="p-4 border-b border-gray-800/30 shrink-0">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Soạn thảo nội dung</h2>
                {latestVersion && (
                  <p className="text-[10px] text-gray-600 mt-0.5">
                    v{latestVersion.versionNumber} · {latestVersion.contentType} · {relTime(latestVersion.createdAt)}
                  </p>
                )}
              </div>

              <div className="p-5 space-y-4">
                {/* Content Type */}
                <div>
                  <label className="block text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-1.5">
                    Định dạng nội dung
                  </label>
                  <select
                    value={form.contentType}
                    disabled={!isEditable}
                    onChange={(e) => setForm({ ...form, contentType: e.target.value })}
                    className="px-3 py-1.5 rounded-lg bg-[#0a0f1d] border border-gray-700/50 text-white text-xs focus:outline-none disabled:opacity-60"
                  >
                    {['FACEBOOK_POST', 'FACEBOOK_REEL_SCRIPT', 'FACEBOOK_STORY', 'SHORT_ARTICLE'].map((t) => (
                      <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>

                {/* Headline */}
                <EditorField
                  label="Tiêu đề"
                  value={form.headline}
                  onChange={(v) => setForm({ ...form, headline: v })}
                  disabled={!isEditable}
                  rows={2}
                />

                {/* Hook */}
                <EditorField
                  label="Mở đầu (Hook)"
                  value={form.hook}
                  onChange={(v) => setForm({ ...form, hook: v })}
                  disabled={!isEditable}
                  rows={3}
                  hint="Câu mở đầu thu hút sự chú ý"
                />

                {/* Body */}
                <EditorField
                  label="Nội dung chính"
                  value={form.body}
                  onChange={(v) => setForm({ ...form, body: v })}
                  disabled={!isEditable}
                  rows={8}
                />

                {/* Why it matters */}
                <EditorField
                  label="Tại sao quan trọng"
                  value={form.whyItMatters}
                  onChange={(v) => setForm({ ...form, whyItMatters: v })}
                  disabled={!isEditable}
                  rows={2}
                />

                {/* Discussion question */}
                <EditorField
                  label="Câu hỏi thảo luận (tuỳ chọn)"
                  value={form.discussionQuestion}
                  onChange={(v) => setForm({ ...form, discussionQuestion: v })}
                  disabled={!isEditable}
                  rows={1}
                />

                {/* Hashtags */}
                <div>
                  <label className="block text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-1.5">
                    Hashtags
                  </label>
                  <input
                    type="text"
                    value={form.hashtags}
                    disabled={!isEditable}
                    onChange={(e) => setForm({ ...form, hashtags: e.target.value })}
                    placeholder="#BóngĐá, #TinTức..."
                    className="w-full px-3 py-2 rounded-lg bg-[#0a0f1d] border border-gray-700/50 text-white text-sm focus:outline-none focus:border-brand-500/50 placeholder-gray-700 disabled:opacity-60"
                  />
                </div>

                {/* Attribution */}
                <EditorField
                  label="Nguồn trích dẫn"
                  value={form.attributionLine}
                  onChange={(v) => setForm({ ...form, attributionLine: v })}
                  disabled={!isEditable}
                  rows={1}
                  hint="Dòng trích dẫn nguồn ở cuối bài"
                />

                {/* Recommended link */}
                <div>
                  <label className="block text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-1.5">
                    Link đọc thêm (tuỳ chọn)
                  </label>
                  <input
                    type="url"
                    value={form.recommendedLink}
                    disabled={!isEditable}
                    onChange={(e) => setForm({ ...form, recommendedLink: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-3 py-2 rounded-lg bg-[#0a0f1d] border border-gray-700/50 text-white text-sm focus:outline-none focus:border-brand-500/50 placeholder-gray-700 disabled:opacity-60"
                  />
                </div>
              </div>
            </div>

            {/* ── Panel 3: Verification ── */}
            <div className={`${activePanel === 'verification' ? 'flex' : 'hidden'} lg:flex flex-col w-full lg:w-[28%] border-l border-gray-800/50 overflow-y-auto bg-[#080c18]`}>
              <div className="p-4 border-b border-gray-800/30 shrink-0">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Kết quả kiểm tra</h2>
              </div>

              <div className="p-4 space-y-4">
                {!verification ? (
                  <div className="text-xs text-gray-500 text-center py-8">
                    Lưu bản nháp để xem kết quả kiểm tra.
                  </div>
                ) : (
                  <>
                    {/* Overall result */}
                    <div className={`flex items-center gap-2 p-3 rounded-xl border ${
                      verification.passed
                        ? 'bg-emerald-900/20 border-emerald-700/30'
                        : 'bg-red-900/20 border-red-700/30'
                    }`}>
                      <span className="text-lg">{verification.passed ? '✓' : '✗'}</span>
                      <div>
                        <p className={`text-xs font-semibold ${verification.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                          {verification.passed ? 'Kiểm tra đạt' : 'Có lỗi cần sửa'}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          Rủi ro: {RISK_LEVEL_CONFIG[verification.riskLevel]?.label || verification.riskLevel}
                        </p>
                      </div>
                    </div>

                    {/* Similarity bar */}
                    <SimilarityBar score={verification.similarityScore} />

                    {/* Blocking errors */}
                    {verification.blockingErrors?.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] uppercase font-semibold text-red-500 tracking-wider">Lỗi nghiêm trọng</p>
                        {verification.blockingErrors.map((e, i) => (
                          <div key={i} className="flex gap-2 text-xs text-red-300 bg-red-900/10 rounded-lg px-2 py-1.5">
                            <span>⚠</span><span>{e}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Warnings */}
                    {verification.warnings?.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] uppercase font-semibold text-yellow-500 tracking-wider">Cảnh báo</p>
                        {verification.warnings.map((w, i) => (
                          <div key={i} className="flex gap-2 text-xs text-yellow-300 bg-yellow-900/10 rounded-lg px-2 py-1.5">
                            <span>!</span><span>{w}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Forbidden phrases */}
                    {verification.forbiddenPhrasesFound?.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] uppercase font-semibold text-orange-500 tracking-wider">Từ ngữ bị cấm</p>
                        <div className="flex flex-wrap gap-1">
                          {verification.forbiddenPhrasesFound.map((p, i) => (
                            <span key={i} className="px-2 py-0.5 rounded-full bg-orange-900/30 text-orange-400 text-[10px] border border-orange-800/30">
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-800/30">
                      {[
                        { label: 'Dữ kiện xác nhận', value: verification.checkedClaimsCount ?? 0 },
                        { label: 'Từ trích dẫn', value: verification.quotedWordCount ?? 0 },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-[#0c1323] rounded-lg p-2 text-center">
                          <p className="text-base font-bold text-white">{value}</p>
                          <p className="text-[9px] text-gray-500">{label}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Publish / Schedule Modal ── */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-sm">
          <div className="bg-[#0a0f1d] border border-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-800/40 flex justify-between items-center bg-[#0c1224]">
              <h3 className="text-sm font-bold text-white">Xuất bản bài viết lên Facebook</h3>
              <button onClick={() => setShowPublishModal(false)} className="text-gray-400 hover:text-white">&times;</button>
            </div>

            <div className="p-6 space-y-4">
              {/* Connected Page */}
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Chọn Trang Facebook</label>
                {facebookPages.length === 0 ? (
                  <p className="text-xs text-orange-400 bg-orange-950/20 border border-orange-900/30 rounded-lg p-2.5">
                    Chưa có Trang Facebook nào được liên kết với Workspace này. Hãy vào Cài đặt để liên kết.
                  </p>
                ) : (
                  <select
                    value={selectedPageId}
                    onChange={(e) => setSelectedPageId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#070a13] border border-gray-800 text-white text-xs focus:outline-none focus:border-brand-500/50"
                  >
                    {facebookPages.map((p) => (
                      <option key={p.id} value={p.id}>{p.pageName}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Publication Type */}
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Định dạng hiển thị</label>
                <select
                  value={publicationType}
                  onChange={(e) => setPublicationType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#070a13] border border-gray-800 text-white text-xs focus:outline-none focus:border-brand-500/50"
                >
                  <option value="LINK">Bài viết kèm Link</option>
                  <option value="TEXT">Bài viết thuần Text</option>
                  <option value="PHOTO">Bài viết kèm Ảnh (nếu có)</option>
                </select>
              </div>

              {/* Publish Type Switch */}
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Hình thức xuất bản</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPublishType('IMMEDIATE')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${publishType === 'IMMEDIATE' ? 'bg-brand-600/25 border-brand-500 text-brand-400' : 'bg-transparent border-gray-800 text-gray-400 hover:text-gray-300'}`}
                  >
                    Đăng ngay
                  </button>
                  <button
                    onClick={() => setPublishType('SCHEDULED')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${publishType === 'SCHEDULED' ? 'bg-brand-600/25 border-brand-500 text-brand-400' : 'bg-transparent border-gray-800 text-gray-400 hover:text-gray-300'}`}
                  >
                    Lên lịch đăng
                  </button>
                </div>
              </div>

              {/* Scheduled fields */}
              {publishType === 'SCHEDULED' && (
                <div className="space-y-3 p-3.5 rounded-xl border border-gray-850 bg-gray-900/10">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Thời gian đăng (Local)</label>
                    <input
                      type="datetime-local"
                      value={localDateTime}
                      onChange={(e) => setLocalDateTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#070a13] border border-gray-800 text-white text-xs focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Múi giờ</label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#070a13] border border-gray-800 text-white text-xs focus:outline-none"
                    >
                      <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (GMT+7)</option>
                      <option value="UTC">Coordinated Universal Time (UTC)</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-gray-500 font-medium">
                    * Múi giờ hệ thống mặc định là Asia/Ho_Chi_Minh. Phải lên lịch trước ít nhất 2 phút.
                  </p>
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handlePublishOrSchedule}
                disabled={publishing || facebookPages.length === 0}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-blue-600 text-white font-bold hover:from-brand-500 hover:to-blue-500 transition-all disabled:opacity-40"
              >
                {publishing ? 'Đang thực thi...' : publishType === 'IMMEDIATE' ? 'Đăng bài ngay' : 'Xác nhận lên lịch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditorField sub-component
// ---------------------------------------------------------------------------
interface EditorFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  rows?: number;
  hint?: string;
}

function EditorField({ label, value, onChange, disabled, rows = 3, hint }: EditorFieldProps) {
  return (
    <div>
      <label className="block text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-1.5">
        {label}
        {hint && <span className="ml-2 normal-case text-gray-600 font-normal">{hint}</span>}
      </label>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full px-3 py-2 rounded-lg bg-[#0a0f1d] border border-gray-700/50 text-white text-sm focus:outline-none focus:border-brand-500/50 resize-none leading-relaxed disabled:opacity-60 placeholder-gray-700"
      />
    </div>
  );
}
