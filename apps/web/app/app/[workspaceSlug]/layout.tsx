'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

/* ═══ Icon Components ═══ */
const Icons = {
  articles: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 4a2 2 0 00-2-2m-2 0a2 2 0 012 2v8a2 2 0 01-2 2h-2m-4-11h4m-4 4h4m-4 4h2" />
    </svg>
  ),
  sources: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z" />
    </svg>
  ),
  drafts: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
  calendar: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  brand: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  ),
  notifications: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
  facebook: (
    <svg className="w-[18px] h-[18px] fill-current" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  ),
  autopilot: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  aiTokens: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  ),
  settings: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  chevronDown: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  ),
  menu: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  close: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
};

/* ═══ Navigation Structure ═══ */
type NavSection = {
  title: string;
  items: { name: string; href: string; icon: React.ReactNode; badge?: string }[];
};

function buildNav(slug: string): NavSection[] {
  return [
    {
      title: 'NỘI DUNG',
      items: [
        { name: 'Luồng tin tức', href: `/app/${slug}/articles`, icon: Icons.articles },
        { name: 'Nguồn cấp tin', href: `/app/${slug}/sources`, icon: Icons.sources },
        { name: 'Bản nháp', href: `/app/${slug}/drafts`, icon: Icons.drafts },
      ],
    },
    {
      title: 'XUẤT BẢN & TỰ ĐỘNG',
      items: [
        { name: 'Tự động hóa 100%', href: `/app/${slug}/autopilot`, icon: Icons.autopilot, badge: 'Auto' },
        { name: 'Lịch xuất bản', href: `/app/${slug}/calendar`, icon: Icons.calendar },
        { name: 'Kênh Facebook', href: `/app/${slug}/settings/facebook-pages`, icon: Icons.facebook },
      ],
    },
    {
      title: 'CẤU HÌNH & HẠN MỨC',
      items: [
        { name: 'Quản lý Token AI', href: `/app/${slug}/ai-usage`, icon: Icons.aiTokens },
        { name: 'Hồ sơ thương hiệu', href: `/app/${slug}/brand-profiles`, icon: Icons.brand },
        { name: 'Thông báo', href: `/app/${slug}/notifications`, icon: Icons.notifications },
        { name: 'Cài đặt', href: `/app/${slug}/settings`, icon: Icons.settings },
      ],
    },
  ];
}

/* ═══ Breadcrumb builder ═══ */
function buildBreadcrumb(pathname: string, slug: string) {
  const segments = pathname.replace(`/app/${slug}`, '').split('/').filter(Boolean);
  const labels: Record<string, string> = {
    articles: 'Luồng tin tức',
    sources: 'Nguồn cấp tin',
    drafts: 'Bản nháp',
    autopilot: 'Tự động hóa 100%',
    'ai-usage': 'Quản lý Token AI',
    calendar: 'Lịch xuất bản',
    'brand-profiles': 'Hồ sơ thương hiệu',
    notifications: 'Thông báo',
    settings: 'Cài đặt',
    'facebook-pages': 'Kênh Facebook',
    billing: 'Thanh toán',
    usage: 'Mức sử dụng',
  };
  return segments.map((seg) => labels[seg] || seg);
}

/* ═══ Layout Component ═══ */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const workspaceSlug = (params.workspaceSlug as string) || 'default-workspace';
  const navSections = buildNav(workspaceSlug);
  const breadcrumbs = buildBreadcrumb(pathname, workspaceSlug);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-surface-base text-zinc-100">
      {/* ─── Mobile overlay ─── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ─── Sidebar ─── */}
      <aside
        className={`
          fixed top-0 left-0 h-full z-50 w-[260px]
          bg-surface-sunken border-r border-zinc-800/40
          flex flex-col transition-transform duration-300 ease-out
          lg:translate-x-0 lg:relative lg:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="h-14 px-5 flex items-center justify-between border-b border-zinc-800/30 shrink-0">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-accent-500/10 group-hover:scale-105 transition-transform">
              <span className="font-display text-white text-lg font-bold italic">T</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-zinc-100 tracking-tight">ToolFace</span>
              <span className="text-[9px] text-accent-400 font-medium tracking-widest uppercase">AI Platform</span>
            </div>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-zinc-500 hover:text-zinc-300">
            {Icons.close}
          </button>
        </div>

        {/* Workspace Switcher */}
        <div className="px-4 py-3 border-b border-zinc-800/20">
          <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900/60 border border-zinc-800/40 hover:bg-zinc-800/40 transition-colors group">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded bg-accent-900/40 flex items-center justify-center text-accent-400 text-[10px] font-bold">
                {workspaceSlug.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-medium text-zinc-300 truncate max-w-[140px]">{workspaceSlug}</span>
            </div>
            <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">{Icons.chevronDown}</span>
          </button>
        </div>

        {/* Navigation Sections */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {navSections.map((section) => (
            <div key={section.title}>
              <p className="px-3 mb-2 text-[10px] font-semibold text-zinc-600 tracking-[0.15em] uppercase">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`
                        flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium
                        transition-all duration-150 group
                        ${isActive
                          ? 'bg-accent-500/10 text-accent-300 shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40'
                        }
                      `}
                    >
                      <span className={`transition-colors ${isActive ? 'text-accent-400' : 'text-zinc-600 group-hover:text-zinc-400'}`}>
                        {item.icon}
                      </span>
                      <span>{item.name}</span>
                      {item.badge && (
                        <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold bg-accent-500/10 text-accent-400">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-zinc-800/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-600 to-emerald-600 flex items-center justify-center text-white text-[11px] font-bold shadow-inner">
              AD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-zinc-200 truncate">Administrator</p>
              <p className="text-[10px] text-zinc-600">Owner</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ─── Main ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 border-b border-zinc-800/30 bg-surface-base/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-6 shrink-0">
          {/* Left: Hamburger + Breadcrumb */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {Icons.menu}
            </button>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-600">
              <Link href={`/app/${workspaceSlug}/articles`} className="hover:text-zinc-400 transition-colors">
                Workspace
              </Link>
              {breadcrumbs.map((crumb, i) => (
                <React.Fragment key={i}>
                  <span className="text-zinc-700">/</span>
                  <span className={i === breadcrumbs.length - 1 ? 'text-zinc-300 font-medium' : 'text-zinc-500'}>
                    {crumb}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Right: Status dot */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/60 border border-zinc-800/40">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[10px] text-zinc-400 font-medium tracking-wide">Online</span>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-8 animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
