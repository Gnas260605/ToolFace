'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

/** Safely extract a message from an unknown catch value. */
function getErrMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const EMOJI_POLICY_LABELS: Record<string, string> = {
  NONE: 'Không dùng',
  LOW: 'Ít',
  MODERATE: 'Vừa phải',
};

const STATUS_DOT = (isDefault: boolean) =>
  isDefault ? 'bg-emerald-400' : 'bg-gray-600';

interface BrandProfile {
  id: string;
  name: string;
  language: string;
  tone: string;
  audience: string;
  writingRulesJson: string[];
  forbiddenPhrasesJson: string[];
  defaultHashtagsJson: string[];
  headlineStyle: string;
  emojiPolicy: string;
  defaultPostLength: number;
  isDefault: boolean;
  createdAt: string;
}

const emptyForm = {
  name: '',
  tone: '',
  audience: '',
  writingRules: '',
  forbiddenPhrases: '',
  defaultHashtags: '',
  attributionTemplate: 'Nguồn: {{source}}',
  headlineStyle: 'Súc tích, dưới 12 từ',
  emojiPolicy: 'MODERATE',
  language: 'vi',
  isDefault: false,
};

export default function BrandProfilesPage() {
  const params = useParams();
  const workspaceId = params.workspaceSlug as string;

  const [profiles, setProfiles] = useState<BrandProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/brand-profiles`, {
        headers: { 'x-user-role': 'OWNER', 'x-workspace-id': workspaceId },
      });
      if (!res.ok) throw new Error('Không tải được danh sách hồ sơ thương hiệu');
      setProfiles(await res.json());
    } catch (e: unknown) {
      setError(getErrMsg(e));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/brand-profiles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'OWNER',
          'x-workspace-id': workspaceId,
        },
        body: JSON.stringify({
          name: form.name,
          tone: form.tone,
          audience: form.audience,
          language: form.language,
          writingRules: form.writingRules.split('\n').map(s => s.trim()).filter(Boolean),
          forbiddenPhrases: form.forbiddenPhrases.split(',').map(s => s.trim()).filter(Boolean),
          defaultHashtags: form.defaultHashtags.split(',').map(s => s.trim()).filter(Boolean),
          attributionTemplate: form.attributionTemplate,
          headlineStyle: form.headlineStyle,
          emojiPolicy: form.emojiPolicy,
          isDefault: form.isDefault,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Tạo hồ sơ thất bại');
      }
      setShowForm(false);
      setForm(emptyForm);
      await load();
    } catch (e: unknown) {
      setError(getErrMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/brand-profiles/${id}/set-default`, {
        method: 'POST',
        headers: { 'x-user-role': 'OWNER', 'x-workspace-id': workspaceId },
      });
      await load();
    } catch (e: unknown) {
      setError(getErrMsg(e));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa hồ sơ này?')) return;
    try {
      await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/brand-profiles/${id}`, {
        method: 'DELETE',
        headers: { 'x-user-role': 'OWNER', 'x-workspace-id': workspaceId },
      });
      await load();
    } catch (e: unknown) {
      setError(getErrMsg(e));
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Hồ sơ Thương hiệu</h1>
          <p className="text-sm text-gray-400 mt-1">Quản lý giọng điệu, phong cách biên tập và quy tắc nội dung cho từng thương hiệu.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-blue-600 text-white text-sm font-semibold shadow-lg hover:from-brand-500 hover:to-blue-500 transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Tạo hồ sơ mới
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-900/30 border border-red-700/40 text-red-300 text-sm">{error}</div>
      )}

      {/* Profile Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-500 text-sm">Đang tải...</div>
      ) : profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-500 text-sm gap-2">
          <svg className="w-10 h-10 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <span>Chưa có hồ sơ thương hiệu nào.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {profiles.map((p) => (
            <div key={p.id} className="bg-[#0c1323] border border-gray-800/60 rounded-2xl p-5 space-y-3 hover:border-brand-700/50 transition-all group relative">
              {/* Badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${STATUS_DOT(p.isDefault)}`} />
                  <span className="text-xs font-semibold text-gray-400">{p.isDefault ? 'Mặc định' : 'Phụ'}</span>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-gray-600 font-mono">{p.language}</span>
              </div>
              <h3 className="text-base font-bold text-white leading-tight">{p.name}</h3>
              <p className="text-xs text-gray-400 line-clamp-2">Giọng điệu: <span className="text-gray-300">{p.tone}</span></p>
              <p className="text-xs text-gray-400">Đối tượng: <span className="text-gray-300">{p.audience}</span></p>
              <div className="flex flex-wrap gap-1 pt-1">
                {(p.defaultHashtagsJson || []).slice(0, 3).map((h) => (
                  <span key={h} className="px-2 py-0.5 rounded-full bg-brand-900/40 text-brand-400 text-[10px] font-medium border border-brand-800/30">{h}</span>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-800/40">
                <span className="text-[10px] text-gray-600">Emoji: {EMOJI_POLICY_LABELS[p.emojiPolicy] || p.emojiPolicy}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!p.isDefault && (
                    <button
                      onClick={() => handleSetDefault(p.id)}
                      className="px-2 py-1 text-[10px] rounded-lg bg-emerald-900/30 text-emerald-400 hover:bg-emerald-800/40 transition-colors"
                    >
                      Đặt mặc định
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="px-2 py-1 text-[10px] rounded-lg bg-red-900/20 text-red-400 hover:bg-red-800/30 transition-colors"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <form
            onSubmit={handleCreate}
            className="bg-[#0c1323] border border-gray-700/50 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-white">Tạo Hồ sơ Thương hiệu</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-300">✕</button>
            </div>

            {[
              { label: 'Tên hồ sơ *', key: 'name', type: 'text' },
              { label: 'Giọng điệu *', key: 'tone', type: 'text', placeholder: 'Chuyên nghiệp, năng động, tích cực...' },
              { label: 'Đối tượng *', key: 'audience', type: 'text', placeholder: 'Fan bóng đá Việt Nam 18-35 tuổi...' },
              { label: 'Nguồn trích dẫn (mẫu)', key: 'attributionTemplate', type: 'text' },
              { label: 'Phong cách tiêu đề', key: 'headlineStyle', type: 'text' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label className="block text-xs text-gray-400 mb-1">{label}</label>
                <input
                  type={type}
                  value={(form as Record<string, string | boolean>)[key] as string}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder}
                  required={label.includes('*')}
                  className="w-full px-3 py-2 rounded-lg bg-[#0a0f1d] border border-gray-700/50 text-white text-sm focus:outline-none focus:border-brand-500/60 placeholder-gray-600"
                />
              </div>
            ))}

            <div>
              <label className="block text-xs text-gray-400 mb-1">Quy tắc viết (mỗi dòng một quy tắc)</label>
              <textarea
                value={form.writingRules}
                onChange={(e) => setForm({ ...form, writingRules: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-[#0a0f1d] border border-gray-700/50 text-white text-sm focus:outline-none focus:border-brand-500/60 resize-none"
                placeholder={"Không dùng biệt danh cầu thủ\nKhông đưa tin đồn chưa xác thực"}
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Từ cấm (phân cách bởi dấu phẩy)</label>
              <input
                type="text"
                value={form.forbiddenPhrases}
                onChange={(e) => setForm({ ...form, forbiddenPhrases: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[#0a0f1d] border border-gray-700/50 text-white text-sm focus:outline-none focus:border-brand-500/60"
                placeholder="giật gân, sốc, kinh hoàng..."
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Hashtag mặc định (phân cách bởi dấu phẩy)</label>
              <input
                type="text"
                value={form.defaultHashtags}
                onChange={(e) => setForm({ ...form, defaultHashtags: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[#0a0f1d] border border-gray-700/50 text-white text-sm focus:outline-none focus:border-brand-500/60"
                placeholder="#BóngĐá, #Việt Nam, #Premier League"
              />
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">Chính sách Emoji</label>
                <select
                  value={form.emojiPolicy}
                  onChange={(e) => setForm({ ...form, emojiPolicy: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#0a0f1d] border border-gray-700/50 text-white text-sm focus:outline-none"
                >
                  {Object.entries(EMOJI_POLICY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">Ngôn ngữ</label>
                <select
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#0a0f1d] border border-gray-700/50 text-white text-sm focus:outline-none"
                >
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="rounded accent-brand-500"
              />
              Đặt làm hồ sơ mặc định
            </label>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 transition-colors">
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-blue-600 text-white text-sm font-semibold disabled:opacity-50 transition-all hover:from-brand-500 hover:to-blue-500"
              >
                {saving ? 'Đang lưu...' : 'Tạo hồ sơ'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
