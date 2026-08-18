'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';

type SettingItem = {
  key: string;
  value: any;
  source: string;
};

interface SettingsFormProps {
  workspaceId: string;
  apiBase: string;
  initialSettings: SettingItem[];
}

/* ═══ Section Header Component ═══ */
function SectionHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-9 h-9 rounded-lg bg-accent-500/10 flex items-center justify-center text-accent-400 shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

/* ═══ Save Button with inline status ═══ */
function SaveButton({ label, saving, success, onClick }: { label: string; saving: boolean; success: boolean | null; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className={`
        inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold
        transition-all duration-200 active:scale-[0.97]
        disabled:opacity-50 disabled:cursor-not-allowed
        ${success === true
          ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
          : success === false
            ? 'bg-rose-600/20 text-rose-400 border border-rose-500/30'
            : 'bg-accent-600 hover:bg-accent-500 text-white shadow-sm shadow-accent-600/10'
        }
      `}
    >
      {saving ? (
        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : success === true ? (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : null}
      {saving ? 'Đang lưu...' : success === true ? 'Đã lưu' : success === false ? 'Lỗi' : label}
    </button>
  );
}

/* ═══ Main Settings Form ═══ */
export default function SettingsForm({ workspaceId, apiBase, initialSettings }: SettingsFormProps) {
  const settings = initialSettings || [];
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveResults, setSaveResults] = useState<Record<string, boolean>>({});

  const getSettingValue = (key: string) => {
    const item = settings.find((s) => s.key === key);
    return item ? item.value : '';
  };

  // AI Provider state
  const [defaultProvider, setDefaultProvider] = useState(getSettingValue('ai.default_provider') || 'mock');
  const [geminiKey, setGeminiKey] = useState(getSettingValue('ai.gemini_api_key') || '');
  const [openaiKey, setOpenaiKey] = useState(getSettingValue('ai.openai_api_key') || '');
  const [openrouterKey, setOpenrouterKey] = useState(getSettingValue('ai.openrouter_api_key') || '');

  // Editorial state
  const [simWarning, setSimWarning] = useState(getSettingValue('editorial.similarity_warning_threshold') ?? 0.6);
  const [simBlocking, setSimBlocking] = useState(getSettingValue('editorial.similarity_blocking_threshold') ?? 0.8);
  const [maxQuote, setMaxQuote] = useState(getSettingValue('editorial.maximum_quote_words') ?? 25);
  const [blockRisk, setBlockRisk] = useState(getSettingValue('editorial.block_high_risk_submission') ?? true);

  const saveSetting = async (key: string, value: any) => {
    setSavingKey(key);
    setSaveResults((prev) => ({ ...prev, [key]: undefined as any }));

    try {
      const res = await fetch(`${apiBase}/api/v1/workspaces/${workspaceId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'OWNER',
          'x-workspace-id': workspaceId,
        },
        body: JSON.stringify({ key, value }),
      });

      setSaveResults((prev) => ({ ...prev, [key]: res.ok }));
      setTimeout(() => setSaveResults((prev) => ({ ...prev, [key]: undefined as any })), 2500);
    } catch {
      setSaveResults((prev) => ({ ...prev, [key]: false }));
      setTimeout(() => setSaveResults((prev) => ({ ...prev, [key]: undefined as any })), 2500);
    } finally {
      setSavingKey(null);
    }
  };

  const providerOptions = [
    { value: 'mock', label: 'Mock (Thử nghiệm)' },
    { value: 'gemini', label: 'Google Gemini' },
    { value: 'openai', label: 'OpenAI (GPT-4)' },
    { value: 'openrouter', label: 'OpenRouter' },
  ];

  return (
    <div className="space-y-6">
      {/* ─── AI Provider Configuration ─── */}
      <div className="rounded-xl border border-zinc-800/50 bg-surface-raised p-6">
        <SectionHeader
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
          title="AI Provider"
          description="Chọn mô hình AI chính và cấu hình fallback chain tự động"
        />

        <div className="space-y-5 pl-12">
          {/* Default Provider */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-400 tracking-wide">Mô hình mặc định</label>
            <div className="flex items-center gap-3">
              <select
                value={defaultProvider}
                onChange={(e) => setDefaultProvider(e.target.value)}
                className="flex-1 rounded-lg bg-zinc-900/80 border border-zinc-800/80 px-3.5 py-2.5 text-sm text-zinc-100 hover:border-zinc-700 focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/20 focus:outline-none appearance-none cursor-pointer"
              >
                {providerOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <SaveButton
                label="Lưu"
                saving={savingKey === 'ai.default_provider'}
                success={saveResults['ai.default_provider'] ?? null}
                onClick={() => saveSetting('ai.default_provider', defaultProvider)}
              />
            </div>
            <p className="text-[11px] text-zinc-600">Thứ tự fallback: Gemini → OpenAI → OpenRouter → Mock</p>
          </div>

          {/* Divider */}
          <div className="border-t border-zinc-800/30" />

          {/* API Keys */}
          <div className="space-y-4">
            <p className="text-xs font-medium text-zinc-400 tracking-wide">API Keys</p>

            {/* Gemini */}
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500">Google Gemini API Key</label>
              <div className="flex items-center gap-3">
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="AIza..."
                  className="flex-1 rounded-lg bg-zinc-900/80 border border-zinc-800/80 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-700 hover:border-zinc-700 focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/20 focus:outline-none"
                />
                <SaveButton
                  label="Lưu"
                  saving={savingKey === 'ai.gemini_api_key'}
                  success={saveResults['ai.gemini_api_key'] ?? null}
                  onClick={() => saveSetting('ai.gemini_api_key', geminiKey)}
                />
              </div>
            </div>

            {/* OpenAI */}
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500">OpenAI API Key</label>
              <div className="flex items-center gap-3">
                <input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-..."
                  className="flex-1 rounded-lg bg-zinc-900/80 border border-zinc-800/80 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-700 hover:border-zinc-700 focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/20 focus:outline-none"
                />
                <SaveButton
                  label="Lưu"
                  saving={savingKey === 'ai.openai_api_key'}
                  success={saveResults['ai.openai_api_key'] ?? null}
                  onClick={() => saveSetting('ai.openai_api_key', openaiKey)}
                />
              </div>
            </div>

            {/* OpenRouter */}
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500">OpenRouter API Key</label>
              <div className="flex items-center gap-3">
                <input
                  type="password"
                  value={openrouterKey}
                  onChange={(e) => setOpenrouterKey(e.target.value)}
                  placeholder="sk-or-..."
                  className="flex-1 rounded-lg bg-zinc-900/80 border border-zinc-800/80 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-700 hover:border-zinc-700 focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/20 focus:outline-none"
                />
                <SaveButton
                  label="Lưu"
                  saving={savingKey === 'ai.openrouter_api_key'}
                  success={saveResults['ai.openrouter_api_key'] ?? null}
                  onClick={() => saveSetting('ai.openrouter_api_key', openrouterKey)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Editorial Policy ─── */}
      <div className="rounded-xl border border-zinc-800/50 bg-surface-raised p-6">
        <SectionHeader
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          }
          title="Chính sách biên tập"
          description="Cấu hình ngưỡng kiểm duyệt trùng lặp và an toàn nội dung"
        />

        <div className="space-y-5 pl-12">
          {/* Similarity Warning */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400">Ngưỡng cảnh báo trùng lặp</label>
              <span className="text-xs font-mono text-accent-400 bg-accent-500/10 px-2 py-0.5 rounded">{simWarning}</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0" max="1" step="0.05"
                value={simWarning}
                onChange={(e) => setSimWarning(parseFloat(e.target.value))}
                className="flex-1 accent-accent-500 h-1.5 bg-zinc-800 rounded-full cursor-pointer"
              />
              <SaveButton
                label="Lưu"
                saving={savingKey === 'editorial.similarity_warning_threshold'}
                success={saveResults['editorial.similarity_warning_threshold'] ?? null}
                onClick={() => saveSetting('editorial.similarity_warning_threshold', simWarning)}
              />
            </div>
          </div>

          {/* Similarity Blocking */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400">Ngưỡng chặn trùng lặp</label>
              <span className="text-xs font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">{simBlocking}</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0" max="1" step="0.05"
                value={simBlocking}
                onChange={(e) => setSimBlocking(parseFloat(e.target.value))}
                className="flex-1 accent-rose-500 h-1.5 bg-zinc-800 rounded-full cursor-pointer"
              />
              <SaveButton
                label="Lưu"
                saving={savingKey === 'editorial.similarity_blocking_threshold'}
                success={saveResults['editorial.similarity_blocking_threshold'] ?? null}
                onClick={() => saveSetting('editorial.similarity_blocking_threshold', simBlocking)}
              />
            </div>
          </div>

          <div className="border-t border-zinc-800/30" />

          {/* Max Quote Words */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">Số từ trích dẫn tối đa</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="5" max="100"
                value={maxQuote}
                onChange={(e) => setMaxQuote(parseInt(e.target.value, 10))}
                className="w-24 rounded-lg bg-zinc-900/80 border border-zinc-800/80 px-3.5 py-2.5 text-sm text-zinc-100 hover:border-zinc-700 focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/20 focus:outline-none text-center"
              />
              <span className="text-xs text-zinc-600">từ</span>
              <SaveButton
                label="Lưu"
                saving={savingKey === 'editorial.maximum_quote_words'}
                success={saveResults['editorial.maximum_quote_words'] ?? null}
                onClick={() => saveSetting('editorial.maximum_quote_words', maxQuote)}
              />
            </div>
          </div>

          {/* Block High Risk */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-zinc-300">Tự động chặn bài rủi ro cao</p>
              <p className="text-[11px] text-zinc-600 mt-0.5">Bài viết có riskLevel = HIGH sẽ bị chặn tự động</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={!!blockRisk}
                onClick={() => setBlockRisk(!blockRisk)}
                className={`
                  relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                  transition-colors duration-200
                  ${blockRisk ? 'bg-accent-600' : 'bg-zinc-700'}
                `}
              >
                <span className={`
                  pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm
                  transition duration-200
                  ${blockRisk ? 'translate-x-5' : 'translate-x-0'}
                `} />
              </button>
              <SaveButton
                label="Lưu"
                saving={savingKey === 'editorial.block_high_risk_submission'}
                success={saveResults['editorial.block_high_risk_submission'] ?? null}
                onClick={() => saveSetting('editorial.block_high_risk_submission', blockRisk)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
