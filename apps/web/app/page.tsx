'use client';

import { useEffect, useState } from 'react';

interface SystemStatus {
  name: string;
  version: string;
  environment: string;
}

export default function Home() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    fetch(`${apiUrl}/api/v1/system/info`)
      .then((res) => {
        if (!res.ok) throw new Error('API returned error');
        return res.json();
      })
      .then((data) => {
        setStatus(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'API không hoạt động');
        setLoading(false);
      });
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col justify-between overflow-hidden bg-[#070a13] selection:bg-brand-500">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-[radial-gradient(circle_at_center,rgba(30,58,138,0.15)_0%,rgba(0,0,0,0)_70%)] pointer-events-none z-0" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none z-0" />

      <header className="relative z-10 w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 to-blue-400 flex items-center justify-center shadow-lg shadow-brand-500/10">
            <span className="font-display font-bold text-white text-base">N</span>
          </div>
          <span className="font-display font-bold text-lg tracking-tight">NewsFlow AI</span>
        </div>
        <div className="flex items-center space-x-2">
          {loading && (
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500"></span>
            </span>
          )}
          {!loading && status && (
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          )}
          {!loading && error && (
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
            </span>
          )}
          <span className="text-xs text-gray-400 font-medium">
            {loading
              ? 'Đang kiểm tra kết nối...'
              : status
                ? 'Hệ thống kết nối thành công'
                : 'Không thể kết nối API'}
          </span>
        </div>
      </header>

      <main className="relative z-10 flex-grow flex flex-col justify-center max-w-4xl mx-auto px-6 py-12 text-center">
        <div className="space-y-6">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-brand-950/40 border border-brand-900/50 backdrop-blur-md">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-400">
              Phiên bản Thử nghiệm 0.1.0
            </span>
          </div>
          <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-tight text-white leading-tight">
            NewsFlow AI
          </h1>
          <p className="max-w-2xl mx-auto text-base sm:text-xl text-gray-300 leading-relaxed font-light">
            Nền tảng hỗ trợ tổng hợp, biên tập và đăng tin lên Facebook Page.
          </p>
        </div>

        <div className="mt-12 max-w-md mx-auto w-full">
          <div className="p-6 rounded-2xl bg-gradient-to-b from-[#101524] to-[#0c101c] border border-gray-800/40 backdrop-blur-md shadow-xl">
            <h2 className="text-sm font-semibold tracking-wider uppercase text-gray-400 mb-4">
              Trạng thái kết nối API
            </h2>

            {loading && (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-gray-800/60 rounded-md w-3/4 mx-auto"></div>
                <div className="h-8 bg-gray-800/60 rounded-md w-full"></div>
                <div className="h-4 bg-gray-800/60 rounded-md w-1/2 mx-auto"></div>
              </div>
            )}

            {!loading && error && (
              <div className="space-y-3">
                <div className="inline-flex items-center justify-center p-3 rounded-full bg-rose-950/20 text-rose-400 border border-rose-900/30">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium text-rose-400">
                  Không thể kết nối đến máy chủ API
                </p>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Backend API ngoại tuyến hoặc gặp lỗi kiểm tra CORS. Vui lòng xác nhận dịch vụ API
                  tại{' '}
                  <code className="px-1 py-0.5 rounded bg-gray-900 text-gray-300 font-mono text-[10px]">
                    apps/api
                  </code>{' '}
                  đang chạy.
                </p>
              </div>
            )}

            {!loading && status && (
              <div className="space-y-4">
                <div className="inline-flex items-center justify-center p-3 rounded-full bg-emerald-950/20 text-emerald-400 border border-emerald-900/30">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-emerald-400">Kết nối thành công</p>
                  <p className="text-xs text-gray-400 mt-1">Hệ thống đang hoạt động bình thường</p>
                </div>
                <div className="pt-2">
                  <a
                    href="/app/default-workspace/drafts"
                    className="inline-flex w-full items-center justify-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-blue-500 hover:from-brand-500 hover:to-blue-400 text-white font-semibold text-sm transition-all duration-200 shadow-lg shadow-brand-500/10 active:scale-[0.98]"
                  >
                    Vào bảng điều khiển Workspace
                  </a>
                </div>
                <div className="pt-4 border-t border-gray-800/40 grid grid-cols-2 gap-3 text-left">
                  <div>
                    <span className="text-[10px] uppercase text-gray-500 font-semibold">
                      Tên dịch vụ
                    </span>
                    <p className="text-xs font-semibold text-gray-300 truncate">{status.name}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-gray-500 font-semibold">
                      Phiên bản
                    </span>
                    <p className="text-xs font-semibold text-gray-300">{status.version}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[10px] uppercase text-gray-500 font-semibold">
                      Môi trường hoạt động
                    </span>
                    <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                      {status.environment}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-16 text-left max-w-4xl mx-auto">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-6 text-center">
            Các giai đoạn phát triển nền tảng
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-brand-950/10 border border-brand-900/20">
              <span className="text-xs font-bold text-brand-500">Giai đoạn 0</span>
              <h4 className="text-sm font-semibold text-white mt-1">Cơ sở hạ tầng</h4>
              <p className="text-[11px] text-gray-400 mt-2">
                Xây dựng Monorepo, thiết lập PostgreSQL, Redis, MinIO và Docker.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-gray-900/10 border border-gray-800/30 opacity-60">
              <span className="text-xs font-bold text-gray-500">Giai đoạn 1-2</span>
              <h4 className="text-sm font-semibold text-gray-300 mt-1">Nhận diện & Thu thập</h4>
              <p className="text-[11px] text-gray-500 mt-2">
                Phân quyền đa tổ chức và thu thập tin tức tự động từ RSS nguồn.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-gray-900/10 border border-gray-800/30 opacity-60">
              <span className="text-xs font-bold text-gray-500">Giai đoạn 3-4</span>
              <h4 className="text-sm font-semibold text-gray-300 mt-1">Biên tập AI & Meta</h4>
              <p className="text-[11px] text-gray-500 mt-2">
                Trích xuất sự kiện qua AI, soạn thảo bài viết và kết nối trang Facebook.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-gray-900/10 border border-gray-800/30 opacity-60">
              <span className="text-xs font-bold text-gray-500">Giai đoạn 5-6</span>
              <h4 className="text-sm font-semibold text-gray-300 mt-1">Lịch đăng & Thương mại</h4>
              <p className="text-[11px] text-gray-500 mt-2">
                Quản lý lịch đăng bài tập trung, đo lường giới hạn và kích hoạt gói phí.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 w-full py-6 border-t border-gray-900/40 text-center text-xs text-gray-500">
        <p>© {new Date().getFullYear()} NewsFlow AI. Đã bảo lưu mọi quyền.</p>
      </footer>
    </div>
  );
}
