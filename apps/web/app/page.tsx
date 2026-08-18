'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Warning, CheckCircle, ArrowRight } from '@phosphor-icons/react';

interface SystemStatus {
  name: string;
  version: string;
  environment: string;
}

const FEATURES = [
  { label: 'AI Đa mô hình', desc: 'Gemini, OpenAI, OpenRouter tự động fallback', color: 'text-accent-400', bg: 'bg-accent-500/10' },
  { label: 'Mã hoá AES-256', desc: 'Token & API keys được bảo vệ bởi AES-256-GCM', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { label: 'Hàng đợi BullMQ', desc: 'Job queue bền vững cho crawl, AI, publish', color: 'text-sky-400', bg: 'bg-sky-500/10' },
  { label: 'Facebook Graph API', desc: 'Đăng bài tự động với retry & backoff', color: 'text-violet-400', bg: 'bg-violet-500/10' },
];

const PHASES = [
  { phase: '00', title: 'Cơ sở hạ tầng', status: 'done', desc: 'Monorepo, Docker Compose, Postgres, Redis, MinIO' },
  { phase: '01', title: 'Nền tảng an toàn', status: 'active', desc: 'AI Provider schema, Failover Chain, AES-256 secrets' },
  { phase: '02', title: 'An toàn xuất bản', status: 'next', desc: 'Auto-Approve Guardrail, Dedup, Facebook retry/backoff' },
  { phase: '03', title: 'Vận hành lâu dài', status: 'planned', desc: 'BullMQ concurrency, structured logging, monitoring' },
];

export default function Home() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    fetch(`${apiUrl}/api/v1/system/info`)
      .then((res) => {
        if (!res.ok) throw new Error('API returned error');
        return res.json();
      })
      .then((data) => { setStatus(data); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col bg-surface-base text-zinc-100 overflow-x-hidden">
      {/* ─── Background Effects ─── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-[10%] w-[600px] h-[600px] bg-accent-500/[0.04] rounded-full blur-[150px]" />
        <div className="absolute bottom-[10%] right-[10%] w-[500px] h-[500px] bg-emerald-500/[0.03] rounded-full blur-[120px]" />
        <div className="dot-grid absolute inset-0 opacity-40" style={{ maskImage: 'radial-gradient(ellipse 70% 50% at 50% 30%, black 50%, transparent 100%)' }} />
      </div>

      {/* ─── Header ─── */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-accent-500/10 group-hover:scale-105 transition-transform">
            <span className="font-display text-white text-xl font-bold">T</span>
          </div>
          <div>
            <span className="text-lg font-bold text-zinc-100 tracking-tight">ToolFace</span>
            <span className="text-[9px] text-accent-400 font-medium tracking-widest uppercase ml-2">AI</span>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900/60 border border-zinc-800/40 backdrop-blur-sm">
          <span className="relative flex h-2 w-2">
            {loading ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </>
            ) : status ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </>
            ) : (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
              </>
            )}
          </span>
          <span className="text-[11px] text-zinc-400 font-medium">
            {loading ? 'Connecting...' : status ? 'Systems Online' : 'Offline'}
          </span>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <main className="relative z-10 flex-grow flex flex-col justify-center max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
          {/* Left */}
          <div className="lg:col-span-7 space-y-8">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-500/10 border border-accent-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse-soft" />
                <span className="text-[10px] font-semibold tracking-widest uppercase text-accent-400">Production Ready</span>
              </div>

              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight">
                <span className="font-display text-zinc-100">Tự động hóa</span>
                <br />
                <span className="font-display bg-clip-text text-transparent bg-gradient-to-r from-accent-400 via-emerald-400 to-teal-300">
                  nội dung Facebook
                </span>
              </h1>

              <p className="text-zinc-500 text-base leading-relaxed max-w-lg">
                Crawl tin tức → AI viết nháp → Duyệt biên tập → Đăng lên Facebook Page.
                Toàn bộ luồng tự động, an toàn, có kiểm soát.
              </p>
            </div>

            {/* Feature Pills */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FEATURES.map((f) => (
                <div key={f.label} className={`flex items-center gap-3 px-4 py-3 rounded-xl ${f.bg} border border-zinc-800/30`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${f.color.replace('text-', 'bg-')}`} />
                  <div>
                    <p className={`text-xs font-semibold ${f.color}`}>{f.label}</p>
                    <p className="text-[11px] text-zinc-500">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Gateway Card */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl bg-surface-raised/90 border border-zinc-800/60 backdrop-blur-xl shadow-2xl shadow-black/20 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-40 h-40 bg-accent-500/[0.04] rounded-full blur-[60px] pointer-events-none" />

              <div className="px-7 py-5 border-b border-zinc-800/30 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-zinc-500 tracking-[0.15em] uppercase">Gateway Status</span>
                <span className="text-[10px] font-medium text-accent-400">v0.1.0</span>
              </div>

              <div className="px-7 py-6 space-y-6">
                {loading && (
                  <div className="space-y-3">
                    <div className="h-3 bg-zinc-800/80 rounded w-1/3 shimmer" />
                    <div className="h-12 bg-zinc-800/80 rounded w-full shimmer" />
                    <div className="h-3 bg-zinc-800/80 rounded w-1/2 shimmer" />
                  </div>
                )}

                {!loading && !status && (
                  <div className="text-center py-4 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
                      <Warning size={24} weight="duotone" />
                    </div>
                    <p className="text-sm font-medium text-rose-400">Không kết nối được API</p>
                    <p className="text-xs text-zinc-500">Hãy khởi động backend trước</p>
                  </div>
                )}

                {!loading && status && (
                  <>
                    <div className="flex items-center gap-4 p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/15">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <CheckCircle size={24} weight="duotone" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-emerald-400">API Gateway Connected</p>
                        <p className="text-[11px] text-zinc-500">Tất cả dịch vụ sẵn sàng</p>
                      </div>
                    </div>

                    <Link
                      href="/app/default-workspace/articles"
                      className="flex w-full items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-gradient-to-r from-accent-600 to-emerald-600 hover:from-accent-500 hover:to-emerald-500 text-white font-bold text-sm transition-all duration-300 shadow-lg shadow-accent-600/15 hover:shadow-accent-500/25 active:scale-[0.98]"
                    >
                      Vào Bảng Điều Khiển
                      <ArrowRight size={20} weight="bold" />
                    </Link>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-800/30">
                      <div>
                        <span className="text-[9px] uppercase tracking-[0.15em] text-zinc-600 font-medium">Dịch vụ</span>
                        <p className="text-xs font-semibold text-zinc-300 mt-0.5">{status.name}</p>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase tracking-[0.15em] text-zinc-600 font-medium">Môi trường</span>
                        <p className="text-xs font-semibold text-accent-400 mt-0.5">{status.environment.toUpperCase()}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Phase Timeline ─── */}
        <section className="mt-28">
          <div className="text-center max-w-xl mx-auto mb-14 space-y-3">
            <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-accent-400">Roadmap</p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-zinc-100">
              Lộ trình phát triển
            </h2>
            <p className="text-sm text-zinc-500">Từng giai đoạn hóa cứng để đưa hệ thống lên production-grade</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PHASES.map((p) => {
              const isActive = p.status === 'active';
              const isDone = p.status === 'done';
              return (
                <div
                  key={p.phase}
                  className={`
                    relative p-6 rounded-xl border transition-all duration-300 group overflow-hidden
                    ${isActive
                      ? 'bg-accent-950/20 border-accent-500/25 hover:border-accent-500/40 shadow-lg shadow-accent-500/5'
                      : isDone
                        ? 'bg-surface-raised border-zinc-800/50 hover:border-zinc-700/60'
                        : 'bg-surface-raised/50 border-zinc-800/30 hover:border-zinc-800/50'
                    }
                  `}
                >
                  {isActive && (
                    <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-accent-400 animate-pulse-soft" />
                  )}

                  <span className={`text-[10px] font-semibold tracking-[0.15em] ${isActive ? 'text-accent-400' : isDone ? 'text-zinc-500' : 'text-zinc-600'}`}>
                    PHASE {p.phase}
                  </span>

                  <h4 className="text-base font-bold text-zinc-100 mt-1.5 font-display">
                    {p.title}
                  </h4>

                  <p className="text-[12px] text-zinc-500 mt-3 leading-relaxed">
                    {p.desc}
                  </p>

                  <div className="mt-5 pt-3 border-t border-zinc-800/30 flex items-center justify-between">
                    <span className="text-[9px] uppercase tracking-[0.12em] text-zinc-600 font-medium">Trạng thái</span>
                    <span className={`
                      text-[10px] font-semibold px-2.5 py-1 rounded-full
                      ${isActive ? 'bg-accent-500/10 text-accent-400' : isDone ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800/60 text-zinc-500'}
                    `}>
                      {isDone ? '✓ Hoàn thành' : isActive ? '● Đang triển khai' : p.status === 'next' ? 'Giai đoạn kế' : 'Lên kế hoạch'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* ─── Footer ─── */}
      <footer className="relative z-10 w-full py-8 border-t border-zinc-800/20 text-center">
        <p className="text-xs text-zinc-600">© {new Date().getFullYear()} ToolFace AI. Built for production scale.</p>
      </footer>
    </div>
  );
}
