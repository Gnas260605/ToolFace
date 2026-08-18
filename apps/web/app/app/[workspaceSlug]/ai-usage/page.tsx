'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface UsageEvent {
  id: string;
  taskType: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostMinor: number;
  status: string;
  durationMs: number;
  occurredAt: string;
}

interface AiUsageSummary {
  period: string;
  factExtractions: number;
  draftGenerations: number;
  verifications: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostMinor: number;
  currency: string;
  budgetMinor: number;
  generationLimit: number;
  remainingGenerations: number;
  remainingBudgetMinor: number;
  byModel: Record<string, { count: number; inputTokens: number; outputTokens: number; costMinor: number }>;
  recentEvents: UsageEvent[];
}

export default function AiUsagePage() {
  const params = useParams();
  const workspaceSlug = (params.workspaceSlug as string) || 'default-workspace';

  const [usage, setUsage] = useState<AiUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceSlug}/ai/usage`, {
        headers: {
          'x-user-role': 'OWNER',
          'x-workspace-id': workspaceSlug,
        },
      });
      if (!res.ok) throw new Error('Không thể tải dữ liệu thống kê Token AI');
      const data = await res.json();
      setUsage(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Format currency
  const formatCost = (minor: number) => {
    const dollars = minor / 100;
    return `$${dollars.toFixed(2)}`;
  };

  const formatTokens = (num: number) => {
    return new Intl.NumberFormat('vi-VN').format(num);
  };

  const getTaskLabel = (task: string) => {
    switch (task) {
      case 'DRAFT_GENERATION':
        return { label: 'Tạo bản nháp bài viết', color: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40' };
      case 'FACT_EXTRACTION':
        return { label: 'Trích xuất dữ kiện (Facts)', color: 'text-sky-400 bg-sky-950/40 border-sky-800/40' };
      case 'DRAFT_VERIFICATION':
        return { label: 'Thẩm định & Fact-check', color: 'text-purple-400 bg-purple-950/40 border-purple-800/40' };
      default:
        return { label: task, color: 'text-zinc-400 bg-zinc-900 border-zinc-800' };
    }
  };

  const percentUsed = usage
    ? Math.min(100, Math.round(((usage.generationLimit - usage.remainingGenerations) / (usage.generationLimit || 1)) * 100))
    : 0;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16 animate-fade-in">
      {/* ─── Header ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/40 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl lg:text-3xl font-extrabold tracking-tight text-zinc-100 flex items-center gap-3">
              <span className="p-2 rounded-2xl bg-gradient-to-tr from-accent-500/20 via-teal-500/20 to-emerald-500/20 border border-accent-500/30 text-accent-300 shadow-md">
                ⚡
              </span>
              Quản Lý Token & Hạn Mức AI
            </h1>
            <span className="px-3 py-1 rounded-full text-[10px] font-extrabold bg-accent-500/10 text-accent-300 border border-accent-500/25 font-display">
              Kỳ: {usage?.period || 'Tháng này'}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-2 font-sans leading-relaxed">
            Theo dõi chi tiết số lượng Token đã tiêu thụ, ngân sách AI và hạn mức tạo bài tự động theo thời gian thực.
          </p>
        </div>

        <button
          onClick={fetchUsage}
          disabled={loading}
          className="btn-shimmer inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-raised hover:bg-zinc-800/80 border border-zinc-800 text-zinc-200 text-xs font-bold transition-all active:scale-95 disabled:opacity-50 font-display shadow-sm self-start md:self-auto"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Làm mới dữ liệu
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-center justify-between shadow-lg font-sans">
          <span className="font-medium">⚠️ {error}</span>
          <button onClick={fetchUsage} className="underline hover:text-rose-100 font-bold">Thử lại</button>
        </div>
      )}

      {/* ─── Metric Cards Grid ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Total Tokens */}
        <div className="p-5 rounded-2xl bg-surface-raised border border-zinc-800/60 backdrop-blur-md relative overflow-hidden group hover:border-accent-500/40 card-hover transition shadow-md">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-25 transition text-4xl">
            🪙
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-display">Tổng Token Đã Dùng</p>
          <p className="text-3xl font-extrabold text-zinc-100 mt-2 tracking-tight font-display">
            {loading ? '...' : formatTokens(usage?.totalTokens || 0)}
          </p>
          <div className="flex items-center gap-3 mt-3 text-[11px] text-zinc-400 font-sans">
            <span>Input: <strong className="text-zinc-200">{formatTokens(usage?.inputTokens || 0)}</strong></span>
            <span>•</span>
            <span>Output: <strong className="text-zinc-200">{formatTokens(usage?.outputTokens || 0)}</strong></span>
          </div>
        </div>

        {/* Card 2: Remaining Generations */}
        <div className="p-5 rounded-2xl bg-surface-raised border border-zinc-800/60 backdrop-blur-md relative overflow-hidden group hover:border-emerald-500/40 card-hover transition shadow-md">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-25 transition text-4xl">
            📝
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-display">Lượt Sinh Bài Còn Lại</p>
          <p className="text-3xl font-extrabold text-emerald-400 mt-2 tracking-tight font-display">
            {loading ? '...' : `${usage?.remainingGenerations || 0} / ${usage?.generationLimit || 200}`}
          </p>
          <div className="w-full bg-zinc-950/80 h-2 rounded-full mt-3 overflow-hidden border border-zinc-800/50">
            <div
              className="bg-gradient-to-r from-accent-500 to-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${percentUsed}%` }}
            />
          </div>
        </div>

        {/* Card 3: AI Budget & Cost */}
        <div className="p-5 rounded-2xl bg-surface-raised border border-zinc-800/60 backdrop-blur-md relative overflow-hidden group hover:border-amber-500/40 card-hover transition shadow-md">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-25 transition text-4xl">
            💵
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-display">Chi Phí Tích Lũy</p>
          <p className="text-3xl font-extrabold text-amber-300 mt-2 tracking-tight font-display">
            {loading ? '...' : formatCost(usage?.estimatedCostMinor || 0)}
          </p>
          <p className="text-[11px] text-zinc-400 mt-3 font-sans">
            Ngân sách: <span className="text-zinc-200 font-semibold">{formatCost(usage?.budgetMinor || 2000)}</span> (Còn {formatCost(usage?.remainingBudgetMinor || 2000)})
          </p>
        </div>

        {/* Card 4: Operations breakdown */}
        <div className="p-5 rounded-2xl bg-surface-raised border border-zinc-800/60 backdrop-blur-md relative overflow-hidden group hover:border-purple-500/40 card-hover transition shadow-md">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-25 transition text-4xl">
            🔍
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-display">Tác Vụ AI Hoàn Tất</p>
          <p className="text-3xl font-extrabold text-indigo-300 mt-2 tracking-tight font-display">
            {loading ? '...' : usage ? (usage.draftGenerations || 0) + (usage.factExtractions || 0) + (usage.verifications || 0) : 0}
          </p>
          <div className="flex items-center gap-2 mt-3 text-[11px] text-zinc-400 font-sans">
            <span>Viết: <strong>{usage?.draftGenerations || 0}</strong></span>
            <span>•</span>
            <span>Facts: <strong>{usage?.factExtractions || 0}</strong></span>
            <span>•</span>
            <span>Duyệt: <strong>{usage?.verifications || 0}</strong></span>
          </div>
        </div>
      </div>

      {/* ─── Model Distribution & Quota Bar ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quota overview box */}
        <div className="lg:col-span-1 p-6 rounded-2xl bg-surface-raised border border-zinc-800/60 shadow-lg backdrop-blur-md flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2 font-display">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Tình Trạng Hạn Mức Gói
            </h3>
            <p className="text-xs text-zinc-400 mt-1 font-sans">
              Hạn mức AI được reset tự động vào ngày đầu tiên mỗi tháng.
            </p>

            <div className="mt-6 space-y-4 font-sans">
              <div>
                <div className="flex justify-between text-xs mb-1.5 font-medium">
                  <span className="text-zinc-400">Tạo bài viết AI</span>
                  <span className="text-zinc-200 font-semibold">{usage?.draftGenerations || 0} / {usage?.generationLimit || 200} bài</span>
                </div>
                <div className="w-full bg-zinc-950 h-2.5 rounded-full overflow-hidden border border-zinc-800/50">
                  <div className="bg-gradient-to-r from-accent-500 to-emerald-500 h-full rounded-full" style={{ width: `${percentUsed}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5 font-medium">
                  <span className="text-zinc-400">Chi phí tiêu thụ</span>
                  <span className="text-zinc-200 font-semibold">{formatCost(usage?.estimatedCostMinor || 0)} / {formatCost(usage?.budgetMinor || 2000)}</span>
                </div>
                <div className="w-full bg-zinc-950 h-2.5 rounded-full overflow-hidden border border-zinc-800/50">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-rose-500 h-full rounded-full"
                    style={{
                      width: `${usage ? Math.min(100, Math.round(((usage.estimatedCostMinor) / (usage.budgetMinor || 1)) * 100)) : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-800/60 text-xs text-zinc-400 flex items-center justify-between font-sans">
            <span>Trạng thái hoạt động:</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1.5 font-display">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Normal (Active)
            </span>
          </div>
        </div>

        {/* Model breakdown table */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-surface-raised border border-zinc-800/60 shadow-lg backdrop-blur-md">
          <h3 className="text-sm font-bold text-zinc-200 font-display">Thống Kê Theo Mô Hình AI</h3>
          <p className="text-xs text-zinc-400 mt-1 font-sans">Phân bổ token và chi phí theo các model LLM đang sử dụng.</p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="text-zinc-500 border-b border-zinc-800/80 uppercase tracking-wider font-bold text-[10px] font-display">
                <tr>
                  <th className="py-2.5 px-3">Mô hình / Provider</th>
                  <th className="py-2.5 px-3 text-right">Lượt gọi</th>
                  <th className="py-2.5 px-3 text-right">Input Tokens</th>
                  <th className="py-2.5 px-3 text-right">Output Tokens</th>
                  <th className="py-2.5 px-3 text-right">Chi phí ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40 text-zinc-300">
                {usage?.byModel && Object.keys(usage.byModel).length > 0 ? (
                  Object.entries(usage.byModel).map(([modelKey, data]) => (
                    <tr key={modelKey} className="hover:bg-zinc-800/30 transition">
                      <td className="py-3 px-3 font-semibold text-zinc-200 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-accent-400" />
                        {modelKey}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">{formatTokens(data.count)}</td>
                      <td className="py-3 px-3 text-right font-mono text-zinc-400">{formatTokens(data.inputTokens)}</td>
                      <td className="py-3 px-3 text-right font-mono text-zinc-400">{formatTokens(data.outputTokens)}</td>
                      <td className="py-3 px-3 text-right font-mono font-extrabold text-emerald-400">{formatCost(data.costMinor)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-500 font-sans">
                      Chưa có phát sinh sử dụng AI trong tháng này.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ─── Recent AI Usage Events ─── */}
      <div className="p-6 rounded-2xl bg-surface-raised border border-zinc-800/60 shadow-lg">
        <h3 className="text-sm font-bold text-zinc-200 mb-4 font-display flex items-center gap-2">
          <span>📜</span> Nhật Ký Tác Vụ AI (Real-time Events Log)
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className="text-zinc-500 border-b border-zinc-800/80 uppercase tracking-wider font-bold text-[10px] font-display">
              <tr>
                <th className="py-2.5 px-3">Thời gian</th>
                <th className="py-2.5 px-3">Loại tác vụ</th>
                <th className="py-2.5 px-3">Mô hình AI</th>
                <th className="py-2.5 px-3 text-right">Tổng Tokens</th>
                <th className="py-2.5 px-3 text-right">Thời gian xử lý</th>
                <th className="py-2.5 px-3 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40 text-zinc-300">
              {usage?.recentEvents && usage.recentEvents.length > 0 ? (
                usage.recentEvents.map((evt) => {
                  const taskInfo = getTaskLabel(evt.taskType);
                  return (
                    <tr key={evt.id} className="hover:bg-zinc-800/30 transition">
                      <td className="py-3 px-3 text-zinc-400 font-mono text-[11px]">
                        {new Date(evt.occurredAt).toLocaleTimeString('vi-VN')}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold border font-display ${taskInfo.color}`}>
                          {taskInfo.label}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-zinc-200">
                        {evt.provider} / <span className="font-mono text-zinc-400 text-[11px]">{evt.model}</span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-zinc-200">
                        {formatTokens(evt.totalTokens)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-zinc-400 text-[11px]">
                        {evt.durationMs} ms
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold font-display border ${
                            evt.status === 'SUCCESS'
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                              : 'bg-rose-950/60 text-rose-300 border-rose-500/30'
                          }`}
                        >
                          {evt.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-zinc-500 font-sans">
                    Chưa có sự kiện gọi AI nào được ghi nhận.
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

