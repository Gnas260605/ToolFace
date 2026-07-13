'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const workspaceSlug = (params.workspaceSlug as string) || 'default-workspace';

  const navItems = [
    {
      name: 'Luồng tin tức',
      href: `/app/${workspaceSlug}/articles`,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 4a2 2 0 00-2-2m-2 0a2 2 0 012 2v8a2 2 0 01-2 2h-2m-4-11h4m-4 4h4m-4 4h2" />
        </svg>
      ),
    },
    {
      name: 'Nguồn cấp tin',
      href: `/app/${workspaceSlug}/sources`,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z" />
        </svg>
      ),
    },
    {
      name: 'Bản nháp',
      href: `/app/${workspaceSlug}/drafts`,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
    },
    {
      name: 'Lịch xuất bản',
      href: `/app/${workspaceSlug}/calendar`,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      name: 'Hồ sơ thương hiệu',
      href: `/app/${workspaceSlug}/brand-profiles`,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      ),
    },
    {
      name: 'Thông báo',
      href: `/app/${workspaceSlug}/notifications`,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    },
    {
      name: 'Kênh Facebook',
      href: `/app/${workspaceSlug}/settings/facebook-pages`,
      icon: (
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen flex bg-[#070a13] text-[#f4f7fb]">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0a0f1d] border-r border-gray-800/40 flex flex-col justify-between z-20 shrink-0">
        <div>
          {/* Logo */}
          <div className="p-6 flex items-center space-x-3 border-b border-gray-800/20">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 to-blue-400 flex items-center justify-center shadow-lg shadow-brand-500/10">
              <span className="font-display font-bold text-white text-base">N</span>
            </div>
            <span className="font-display font-bold text-base tracking-tight text-white">NewsFlow AI</span>
          </div>

          {/* Workspace Info */}
          <div className="px-6 py-4 border-b border-gray-800/20 bg-brand-950/10">
            <span className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Tổ chức hiện tại</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs font-semibold text-brand-400 truncate">{workspaceSlug}</span>
              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-brand-500/10 text-brand-400 border border-brand-500/20">Active</span>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${
                    isActive
                      ? 'bg-gradient-to-r from-brand-600/20 to-blue-600/10 text-white border-l-4 border-brand-500 shadow-md'
                      : 'text-gray-400 hover:bg-gray-800/30 hover:text-gray-200 border-l-4 border-transparent'
                  }`}
                >
                  {item.icon}
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User profile section */}
        <div className="p-4 border-t border-gray-800/20 bg-[#080d19]">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-brand-600 to-emerald-500 flex items-center justify-center text-white text-xs font-bold shadow-inner">
              AD
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-white truncate">Administrator</p>
              <p className="text-[10px] text-gray-500 font-medium">Vai trò: OWNER</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <main className="p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
