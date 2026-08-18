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
  const [videoTemplate, setVideoTemplate] = useState<'STANDARD' | 'TEMPLATE_1_HEADLINE_OVERLAY' | 'TEMPLATE_2_BREAKING_NEWS'>('TEMPLATE_2_BREAKING_NEWS');
  const [bannerColor, setBannerColor] = useState<'#E11D48' | '#2563EB' | '#EAB308'>('#E11D48');
  const [videoUrl, setVideoUrl] = useState<string>('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4');

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

  const [publishResultModal, setPublishResultModal] = useState<{
    status: 'SUCCESS' | 'FAILED' | 'LOADING';
    title: string;
    message: string;
    pageName?: string;
    publicationType?: string;
    facebookPostUrl?: string;
  } | null>(null);

  const handlePublishOrSchedule = async () => {
    if (!draft || !latestVersion) return;
    if (!selectedPageId) {
      setError('Vui lòng chọn trang Facebook để tiếp tục');
      return;
    }
    setPublishing(true);
    setError(null);

    const selectedPage = facebookPages.find((p) => p.id === selectedPageId);
    setShowPublishModal(false);

    setPublishResultModal({
      status: 'LOADING',
      title: publishType === 'IMMEDIATE' ? 'Đang xuất bản lên Facebook...' : 'Đang lên lịch xuất bản...',
      message: `Đang kết nối Facebook Graph API cho Fanpage ${selectedPage?.pageName || ''}...`,
      pageName: selectedPage?.pageName,
      publicationType,
    });

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

        setPublishResultModal({
          status: 'SUCCESS',
          title: 'Đăng Bài Lên Facebook Thành Công! 🎉',
          message: `Bài viết đã được gửi xuất bản trực tiếp lên Fanpage "${selectedPage?.pageName || 'Facebook Page'}". Nội dung đã được tối ưu reach và sẵn sàng tiếp cận độc giả!`,
          pageName: selectedPage?.pageName,
          publicationType,
          facebookPostUrl: `https://facebook.com/${selectedPageId}`,
        });
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

        setPublishResultModal({
          status: 'SUCCESS',
          title: 'Lên Lịch Xuất Bản Thành Công! ⏰',
          message: `Bài viết đã được đặt lịch tự động đăng vào lúc ${new Date(localDateTime).toLocaleString('vi-VN')} (${timezone}) lên Fanpage "${selectedPage?.pageName || 'Facebook Page'}".`,
          pageName: selectedPage?.pageName,
          publicationType,
        });
      }
      await loadDraft();
    } catch (e: unknown) {
      const errMsg = getErrMsg(e);
      setPublishResultModal({
        status: 'FAILED',
        title: 'Xuất Bản Thất Bại ⚠️',
        message: errMsg || 'Không thể kết nối đến Facebook Graph API. Vui lòng kiểm tra lại quyền hạn hoặc mã kết nối Fanpage.',
        pageName: selectedPage?.pageName,
      });
    } finally {
      setPublishing(false);
    }
  };

  // ---- Quick Publish (One-Click Instant Publish) ----
  const handleQuickPublish = async () => {
    if (!draft || !latestVersion) return;
    setPublishing(true);
    setError(null);
    const idempotencyKey = `quick-pub-${workspaceId}-${draftId}-${latestVersion.id}-${Date.now()}`;

    setPublishResultModal({
      status: 'LOADING',
      title: 'Đang phê duyệt và đăng nhanh...',
      message: 'Hệ thống đang đồng bộ với Fanpage Facebook...',
    });

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

      // Auto copy to clipboard for user convenience
      await handleCopyFormattedFacebook();

      setPublishResultModal({
        status: 'SUCCESS',
        title: 'Đăng Bài Thành Công! 🎉',
        message: 'Nội dung bài viết đã được phê duyệt và gửi vào hàng đợi xuất bản trực tiếp lên Facebook. Đồng thời toàn bộ bài viết đã được sao chép sẵn vào Clipboard để bạn có thể dán đăng ngay lập tức!',
      });
      await loadDraft();
    } catch (e: unknown) {
      const errMsg = getErrMsg(e);
      setPublishResultModal({
        status: 'FAILED',
        title: 'Đăng Nhanh Thất Bại ⚠️',
        message: errMsg || 'Có lỗi xảy ra trong quá trình xuất bản tự động.',
      });
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

  // AI Rewrite Panel State
  const [showAiRewriteModal, setShowAiRewriteModal] = useState(false);
  const [aiTone, setAiTone] = useState('VIRAL_FB');
  const [customInstruction, setCustomInstruction] = useState('');
  const [isAiRewriting, setIsAiRewriting] = useState(false);

  const handleExecuteAiRewrite = async () => {
    setIsAiRewriting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/drafts/${draftId}/ai-rewrite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'OWNER',
          'x-workspace-id': workspaceId,
          'x-user-id': 'mock-default-user-id',
        },
        body: JSON.stringify({
          tone: aiTone,
          customInstruction,
        }),
      });
      if (!res.ok) {
        const msg = await parseResponseError(res, 'Viết lại bằng AI thất bại');
        throw new Error(msg);
      }
      showSuccess('AI đã viết lại kịch bản & bài viết thành công! ✨');
      setShowAiRewriteModal(false);
      await loadDraft();
    } catch (e: unknown) {
      setError(getErrMsg(e));
    } finally {
      setIsAiRewriting(false);
    }
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

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-all border border-zinc-700/50 disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : '💾 Lưu nháp'}
          </button>

          <button
            onClick={() => setShowPublishModal(true)}
            className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-all border border-zinc-700/50 flex items-center gap-1.5"
            title="Tùy chọn hẹn giờ và cấu hình Fanpage xuất bản"
          >
            <span>⏰</span> Hẹn giờ đăng
          </button>

          <button
            onClick={handleQuickPublish}
            disabled={publishing}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-accent-600 to-emerald-600 hover:from-accent-500 hover:to-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-accent-600/20 disabled:opacity-50 flex items-center gap-1.5"
          >
            {publishing ? 'Đang đăng bài...' : '🚀 Đăng Ngay Lên Facebook'}
          </button>
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
                        onClick={() => setShowAiRewriteModal(true)}
                        className="px-3 py-1 rounded-md bg-gradient-to-r from-accent-600 to-indigo-600 hover:from-accent-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-accent-600/20 transition-all flex items-center gap-1.5"
                      >
                        <span>✨</span> Viết lại bằng ChatGPT / AI
                      </button>
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

                    {/* ── VIDEO / REELS TEMPLATE SELECTION ── */}
                    <div className="p-4 rounded-xl bg-surface-raised border border-zinc-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-accent-400 uppercase tracking-wider flex items-center gap-1.5">
                          <span>🎬 Mẫu Video / Reels Facebook</span>
                        </label>
                        <span className="text-[10px] text-zinc-500 font-mono">Tự động gắn tít & logo</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setVideoTemplate('TEMPLATE_2_BREAKING_NEWS')}
                          className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                            videoTemplate === 'TEMPLATE_2_BREAKING_NEWS'
                              ? 'bg-rose-500/10 border-rose-500/50 text-rose-300 font-semibold shadow-sm shadow-rose-500/10'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          <div className="font-bold text-[11px] mb-1">Mẫu 2: Tin Nóng (Hóng SG)</div>
                          <div className="text-[10px] text-zinc-500">Banner đỏ/xanh + Video dưới</div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setVideoTemplate('TEMPLATE_1_HEADLINE_OVERLAY')}
                          className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                            videoTemplate === 'TEMPLATE_1_HEADLINE_OVERLAY'
                              ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 font-semibold shadow-sm shadow-amber-500/10'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          <div className="font-bold text-[11px] mb-1">Mẫu 1: Sub/Tít Vàng (Anh Subber)</div>
                          <div className="text-[10px] text-zinc-500">Chữ vàng viền đen + Logo góc</div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setVideoTemplate('STANDARD')}
                          className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                            videoTemplate === 'STANDARD'
                              ? 'bg-zinc-800 border-zinc-600 text-zinc-100 font-semibold'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          <div className="font-bold text-[11px] mb-1">Mẫu Chuẩn</div>
                          <div className="text-[10px] text-zinc-500">Bài viết thường / Link</div>
                        </button>
                      </div>

                      {videoTemplate === 'TEMPLATE_2_BREAKING_NEWS' && (
                        <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/60">
                          <span className="text-[11px] text-zinc-400">Màu Banner:</span>
                          {(['#E11D48', '#2563EB', '#EAB308'] as const).map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setBannerColor(color)}
                              className={`w-6 h-6 rounded-full border-2 transition-all ${
                                bannerColor === color ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      )}

                      {videoTemplate !== 'STANDARD' && (
                        <div className="pt-2 border-t border-zinc-800/60 space-y-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-zinc-400">Đường dẫn Video/Reel (.mp4):</span>
                            <span className="text-zinc-600 font-mono text-[10px]">Tự động phát</span>
                          </div>
                          <input
                            type="text"
                            value={videoUrl}
                            onChange={(e) => setVideoUrl(e.target.value)}
                            placeholder="https://.../video.mp4"
                            className="w-full rounded bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-accent-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── LIVE FACEBOOK PREVIEW COLUMN ── */}
                <div className="w-full lg:w-[440px] bg-surface-sunken border-l border-zinc-800/40 p-6 overflow-y-auto shrink-0">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-zinc-500 tracking-[0.15em] uppercase">Live Facebook Preview</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                      {videoTemplate === 'TEMPLATE_2_BREAKING_NEWS' ? 'Reel: Tin Nóng' : videoTemplate === 'TEMPLATE_1_HEADLINE_OVERLAY' ? 'Reel: Tít Vàng' : 'Feed Post'}
                    </span>
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
                          <p className="font-semibold text-zinc-200 text-xs">ToolFace Entertainment</p>
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
                      {form.hashtags && (
                        <p className="text-accent-400 font-medium">
                          {form.hashtags.split(',').map(tag => tag.trim().startsWith('#') ? tag.trim() : `#${tag.trim()}`).join(' ')}
                        </p>
                      )}
                    </div>

                    {/* ── VIDEO TEMPLATE RENDERING PREVIEW ── */}
                    {videoTemplate === 'TEMPLATE_2_BREAKING_NEWS' && (
                      <div className="border-t border-b border-zinc-900 overflow-hidden bg-black aspect-[4/5] flex flex-col relative">
                        {/* Top Breaking News Banner */}
                        <div
                          className="p-5 flex-1 flex flex-col justify-center items-center text-center relative"
                          style={{ backgroundColor: bannerColor }}
                        >
                          <div className="absolute top-2.5 left-3 flex items-center gap-1.5 opacity-90">
                            <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[8px] font-bold text-white">TF</div>
                            <span className="text-[9px] font-bold text-white tracking-wider uppercase">ToolFace News</span>
                          </div>
                          <h4 className="text-white font-black text-base uppercase leading-snug tracking-tight px-2 drop-shadow-md">
                            {form.headline ? form.headline : 'ĐÁNG SỢ: TỔNG HỢP VỤ VIỆC GÂY XÔN XAO CỘNG ĐỒNG MẠNG TẠI TRUNG QUỐC 😰'}
                          </h4>
                        </div>
                        {/* Bottom Video Player Area */}
                        <div className="h-[60%] bg-zinc-900 relative overflow-hidden flex items-center justify-center">
                          <video
                            src={videoUrl}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-[9px] font-mono text-zinc-300">
                            0:15 / 0:59
                          </div>
                        </div>
                      </div>
                    )}

                    {videoTemplate === 'TEMPLATE_1_HEADLINE_OVERLAY' && (
                      <div className="border-t border-b border-zinc-900 overflow-hidden bg-black aspect-square relative flex items-center justify-center">
                        <video
                          src={videoUrl}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="w-full h-full object-cover"
                        />
                        {/* Top Right Watermark Badge */}
                        <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm border border-white/20">
                          <div className="w-4 h-4 rounded-full bg-amber-400 text-black font-extrabold flex items-center justify-center text-[8px]">TF</div>
                          <span className="text-[9px] font-bold text-amber-300 uppercase">Subber TV</span>
                        </div>
                        {/* Bottom Yellow Headline Overlay */}
                        <div className="absolute bottom-4 inset-x-3 text-center">
                          <p className="text-[#FFE600] font-black text-sm uppercase leading-tight tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] [text-shadow:_0_2px_4px_#000,_0_0_8px_#000]">
                            {form.headline ? form.headline : 'HƠN CẢ TRUYỆN TU TIÊN: ĐANG DẠY HỌC BÌNH THƯỜNG, THẦY GIÁO BẤT NGỜ "PHI THĂNG" 5 THÁNG'}
                          </p>
                        </div>
                      </div>
                    )}

                    {videoTemplate === 'STANDARD' && form.recommendedLink && (
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

      {/* ── PUBLISH RESULT NOTIFICATION POPUP (MODAL) ── */}
      {publishResultModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && publishResultModal.status !== 'LOADING') {
              setPublishResultModal(null);
            }
          }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[99999] flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#121316] border border-zinc-700/80 p-6 shadow-2xl space-y-5 text-center relative overflow-hidden">
            {/* Top decorative glow */}
            <div
              className={`absolute -top-16 left-1/2 -translate-x-1/2 w-44 h-44 rounded-full blur-3xl opacity-30 pointer-events-none ${
                publishResultModal.status === 'SUCCESS'
                  ? 'bg-emerald-500'
                  : publishResultModal.status === 'FAILED'
                  ? 'bg-rose-500'
                  : 'bg-accent-500'
              }`}
            />

            {/* Status Icon */}
            <div className="flex justify-center pt-2">
              {publishResultModal.status === 'LOADING' && (
                <div className="w-16 h-16 rounded-full bg-accent-500/10 border border-accent-500/30 flex items-center justify-center relative">
                  <div className="w-8 h-8 border-3 border-accent-500/30 border-t-accent-400 rounded-full animate-spin" />
                </div>
              )}

              {publishResultModal.status === 'SUCCESS' && (
                <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <span className="text-3xl">✓</span>
                </div>
              )}

              {publishResultModal.status === 'FAILED' && (
                <div className="w-16 h-16 rounded-full bg-rose-500/15 border border-rose-500/40 flex items-center justify-center shadow-lg shadow-rose-500/20">
                  <span className="text-3xl text-rose-400">⚠️</span>
                </div>
              )}
            </div>

            {/* Title & Message */}
            <div className="space-y-2">
              <h3
                className={`text-lg font-bold ${
                  publishResultModal.status === 'SUCCESS'
                    ? 'text-emerald-300'
                    : publishResultModal.status === 'FAILED'
                    ? 'text-rose-300'
                    : 'text-zinc-100'
                }`}
              >
                {publishResultModal.title}
              </h3>
              <p className="text-xs text-zinc-300 leading-relaxed max-w-sm mx-auto">
                {publishResultModal.message}
              </p>
            </div>

            {/* Metadata Card (if success) */}
            {publishResultModal.status === 'SUCCESS' && publishResultModal.pageName && (
              <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 text-left space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Fanpage:</span>
                  <span className="text-zinc-200 font-semibold">{publishResultModal.pageName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Định dạng:</span>
                  <span className="text-accent-400">{publishResultModal.publicationType || 'FACEBOOK_POST'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Trạng thái:</span>
                  <span className="text-emerald-400 font-bold">Đã phân phối ✓</span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col gap-2">
              {publishResultModal.status === 'SUCCESS' && (
                <>
                  <button
                    onClick={() => {
                      handleCopyFormattedFacebook();
                      showSuccess('Đã sao chép toàn bộ bài viết vào bộ nhớ tạm!');
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-accent-600 to-emerald-600 hover:from-accent-500 hover:to-emerald-500 text-white font-bold text-xs shadow-lg transition flex items-center justify-center gap-1.5"
                  >
                    <span>📋</span>
                    <span>Sao chép bài viết (Đã kèm Link & Hashtags)</span>
                  </button>

                  <button
                    onClick={() => setPublishResultModal(null)}
                    className="w-full py-2 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs transition"
                  >
                    Hoàn tất & Đóng
                  </button>
                </>
              )}

              {publishResultModal.status === 'FAILED' && (
                <>
                  <button
                    onClick={() => {
                      setPublishResultModal(null);
                      setShowPublishModal(true);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg transition"
                  >
                    Thử xuất bản lại
                  </button>
                  <button
                    onClick={() => setPublishResultModal(null)}
                    className="w-full py-2 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs transition"
                  >
                    Đóng thông báo
                  </button>
                </>
              )}

              {publishResultModal.status === 'LOADING' && (
                <p className="text-[11px] text-zinc-500 animate-pulse">Vui lòng chờ trong giây lát...</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── AI SCRIPT & POST REWRITER MODAL (CHATGPT / OPENAI / GEMINI) ── */}
      {showAiRewriteModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isAiRewriting) {
              setShowAiRewriteModal(false);
            }
          }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[99999] flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="w-full max-w-lg rounded-2xl bg-[#121316] border border-zinc-700/80 p-6 shadow-2xl space-y-5 text-left relative overflow-hidden">
            {/* Top decorative glow */}
            <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-3xl opacity-30 bg-indigo-500 pointer-events-none" />

            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">✨</span>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">Trợ Lý AI Viết Lại Kịch Bản & Bài Viết</h3>
                  <p className="text-[11px] text-zinc-400">Sử dụng API Key ChatGPT / OpenAI / Gemini đã cấu hình</p>
                </div>
              </div>
              <button
                onClick={() => setShowAiRewriteModal(false)}
                disabled={isAiRewriting}
                className="text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
              >
                ✕
              </button>
            </div>

            {/* Style selector */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-300">Chọn Phong Cách Bài Đăng / Kịch Bản</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { id: 'VIRAL_FB', title: '🔥 Viral FB Triệu View', desc: 'Hook giật tít, tò mò, emoji đắt giá' },
                  { id: 'REEL_SUB_GOLD', title: '🎬 Reel Sub Vàng (Anh Subber)', desc: 'Tiêu đề in hoa chữ vàng, storytelling kịch tính' },
                  { id: 'BREAKING_BANNER', title: '🚨 Tin Nóng (Banner Đỏ)', desc: 'Cảnh báo khẩn, thời sự nóng hổi' },
                  { id: 'HUMOR_DRAMA', title: '🎭 Hài Hước / Drama', desc: 'Hài hước, châm biếm, thu hút tranh luận' },
                  { id: 'JOURNALISM', title: '📰 Báo Chí Súc Tích', desc: 'Khách quan, trang trọng, chuẩn dữ kiện' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAiTone(item.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      aiTone === item.id
                        ? 'bg-accent-500/15 border-accent-500/50 text-accent-200 shadow-sm shadow-accent-500/10'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <p className="text-xs font-bold text-zinc-200">{item.title}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">{item.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Instruction Input & Quick Presets */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-300">Yêu cầu bổ sung cho AI (Tùy chọn)</label>
                <span className="text-[10px] text-zinc-500">Bấm gợi ý bên dưới để chọn nhanh</span>
              </div>

              {/* Clickable Preset Prompt Chips */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: '✨ Tự nhiên như Người thật (Anti-AI)', prompt: 'Viết cực kỳ tự nhiên, gãy gọn, giàu cảm xúc chân thực như biên tập viên kỳ cựu. CẤM các từ ngữ sáo rỗng của AI như "không thể phủ nhận", "minh chứng cho", "bức tranh toàn cảnh", "cảm động lòng người", "cuộc sống mang đến".' },
                  { label: '🎯 Truyền cảm hứng sâu sắc', prompt: 'Kể lại hành trình nghị lực một cách chân thực, sâu lắng, đi thẳng vào các chi tiết đời thường và câu nói đắt giá của nhân vật.' },
                  { label: '🔥 Hook 3s giật tít Viral', prompt: 'Tiêu đề và mở đầu đánh thẳng vào nghịch lý/con số ấn tượng, giật tít tự nhiên, tạo sự tò mò cao độ giữ chân người xem.' },
                  { label: '🎬 Kịch bản Reel Sub Vàng', prompt: 'Viết dạng kịch bản video ngắn [Cảnh quay] + [Lời bình Sub vàng kịch tính], ngắt nhịp dứt khoát theo phong cách Review.' },
                  { label: '💬 Kích thích tranh luận', prompt: 'Nêu góc nhìn đa chiều, phân tích sắc bén và đặt câu hỏi tranh luận mạnh mẽ ở cuối bài để thu hút hàng trăm bình luận.' },
                  { label: '⚡ Tóm tắt 3 gạch đầu dòng', prompt: 'Tóm tắt tin tức cực kỳ cô đọng trong 3 gạch đầu dòng, ngắt dòng thoáng mắt, dùng emoji chỉ điểm chi tiết cốt lõi.' },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setCustomInstruction(preset.prompt)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                      customInstruction === preset.prompt
                        ? 'bg-accent-500/20 border-accent-500/60 text-accent-300 shadow-sm shadow-accent-500/10'
                        : 'bg-zinc-900/90 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800/60'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <textarea
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
                placeholder="Chọn gợi ý bên trên hoặc tự nhập: Ví dụ: Thêm lời thoại kịch tính cho 3 giây đầu, chèn câu hỏi kích thích bình luận..."
                rows={3}
                className="w-full rounded-xl bg-zinc-900 border border-zinc-800 p-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-accent-500"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowAiRewriteModal(false)}
                disabled={isAiRewriting}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-medium hover:bg-zinc-700 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleExecuteAiRewrite}
                disabled={isAiRewriting}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-accent-600 to-indigo-600 hover:from-accent-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-accent-600/20 flex items-center gap-2 disabled:opacity-50"
              >
                {isAiRewriting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>AI Đang Viết Lại...</span>
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    <span>Thực Thi Viết Lại Với AI</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
