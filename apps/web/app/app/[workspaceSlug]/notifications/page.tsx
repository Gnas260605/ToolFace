'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

interface Notification {
  id: string;
  type: string;
  category: string;
  title: string;
  message: string;
  severity: string;
  status: string;
  createdAt: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const SEVERITY_COLORS: Record<string, string> = {
  INFO: 'bg-blue-900/20 text-blue-400 border-blue-800/40',
  SUCCESS: 'bg-emerald-900/20 text-emerald-400 border-emerald-800/40',
  WARNING: 'bg-yellow-900/20 text-yellow-400 border-yellow-800/40',
  ERROR: 'bg-red-900/20 text-red-400 border-red-800/40',
  CRITICAL: 'bg-red-900/40 text-red-300 border-red-700/50 font-bold',
};

export default function NotificationsPage() {
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'UNREAD' | 'READ' | 'ARCHIVED' | ''>('UNREAD');
  const [unreadCount, setUnreadCount] = useState(0);

  // Load notifications
  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      if (statusFilter) queryParams.append('status', statusFilter);

      const res = await fetch(
        `${API_BASE}/api/v1/workspaces/${workspaceSlug}/notifications?${queryParams.toString()}`,
        {
          headers: {
            'x-user-role': 'OWNER',
            'x-workspace-id': workspaceSlug,
            'x-user-id': 'mock-user-123', // simulation header
          },
        }
      );

      if (!res.ok) throw new Error('Không thể tải danh sách thông báo');
      const data = await res.json();
      setNotifications(data.items || []);

      // Also get unread count
      const countRes = await fetch(
        `${API_BASE}/api/v1/workspaces/${workspaceSlug}/notifications/unread-count`,
        {
          headers: {
            'x-user-role': 'OWNER',
            'x-workspace-id': workspaceSlug,
            'x-user-id': 'mock-user-123',
          },
        }
      );
      if (countRes.ok) {
        const countData = await countRes.json();
        setUnreadCount(countData.count || 0);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, statusFilter]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Mark single as read
  const handleMarkRead = async (id: string) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/workspaces/${workspaceSlug}/notifications/${id}/read`,
        {
          method: 'POST',
          headers: {
            'x-user-role': 'OWNER',
            'x-workspace-id': workspaceSlug,
            'x-user-id': 'mock-user-123',
          },
        }
      );
      if (!res.ok) throw new Error('Thất bại');
      loadNotifications();
    } catch (err: unknown) {
      void err;
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/workspaces/${workspaceSlug}/notifications/read-all`,
        {
          method: 'POST',
          headers: {
            'x-user-role': 'OWNER',
            'x-workspace-id': workspaceSlug,
            'x-user-id': 'mock-user-123',
          },
        }
      );
      if (!res.ok) throw new Error('Thất bại');
      loadNotifications();
    } catch (err: unknown) {
      void err;
    }
  };

  // Archive notification
  const handleArchive = async (id: string) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/workspaces/${workspaceSlug}/notifications/${id}/archive`,
        {
          method: 'POST',
          headers: {
            'x-user-role': 'OWNER',
            'x-workspace-id': workspaceSlug,
            'x-user-id': 'mock-user-123',
          },
        }
      );
      if (!res.ok) throw new Error('Thất bại');
      loadNotifications();
    } catch (err: unknown) {
      void err;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <span>Thông báo</span>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-xs font-bold animate-pulse">
                {unreadCount} mới
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-400 mt-1">Cập nhật tin tức hệ thống, tiến trình đăng bài và sự kiện.</p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 text-xs font-semibold self-start"
          >
            Đánh dấu đã đọc tất cả
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex bg-[#0a0f1d] border border-gray-800/60 p-0.5 rounded-xl self-start w-fit">
        {(['UNREAD', 'READ', 'ARCHIVED'] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setStatusFilter(filter)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              statusFilter === filter ? 'bg-brand-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {filter === 'UNREAD' ? 'Chưa đọc' : filter === 'READ' ? 'Đã đọc' : 'Lưu trữ'}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-red-900/20 border border-red-800/50 rounded-xl text-red-300 text-xs">{error}</div>
      )}

      {/* Notifications List */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-500">Đang tải thông báo...</div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-500 border border-gray-800/40 rounded-2xl bg-[#080d1a]/20">
          Không có thông báo nào trong mục này.
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => {
            const severityCls = SEVERITY_COLORS[n.severity] || 'bg-gray-850 text-white';
            return (
              <div
                key={n.id}
                className="bg-[#0c1323] border border-gray-800/60 hover:border-gray-800 p-4 rounded-2xl flex items-start gap-4 transition-all"
              >
                <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${severityCls}`}>
                  {n.severity}
                </span>

                <div className="flex-1 space-y-1">
                  <h4 className="text-xs font-bold text-white leading-tight">{n.title}</h4>
                  <p className="text-xs text-gray-400">{n.message}</p>
                  <p className="text-[10px] text-gray-600">
                    Phân loại: {n.category} · {new Date(n.createdAt).toLocaleString('vi-VN')}
                  </p>
                </div>

                <div className="flex gap-2 self-center shrink-0">
                  {n.status === 'UNREAD' && (
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      className="px-2.5 py-1 text-[10px] font-bold rounded bg-brand-950/40 text-brand-400 hover:bg-brand-900/50 border border-brand-800/30"
                    >
                      Đã đọc
                    </button>
                  )}
                  {n.status !== 'ARCHIVED' && (
                    <button
                      onClick={() => handleArchive(n.id)}
                      className="px-2.5 py-1 text-[10px] font-bold rounded bg-gray-850 text-gray-400 hover:text-white border border-gray-800/30"
                    >
                      Lưu trữ
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
