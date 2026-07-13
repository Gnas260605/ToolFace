'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';



const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function NotificationSettingsPage() {
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states
  const [inApp, setInApp] = useState(true);
  const [email, setEmail] = useState(true);
  const [quietHours, setQuietHours] = useState({
    enabled: false,
    start: '22:00',
    end: '07:00',
    timezone: 'Asia/Ho_Chi_Minh',
  });

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/workspaces/${workspaceSlug}/notification-preferences`, {
      headers: {
        'x-user-role': 'OWNER',
        'x-workspace-id': workspaceSlug,
        'x-user-id': 'mock-user-123',
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Không thể tải cấu hình thông báo');
        return res.json();
      })
      .then((data) => {
        setInApp(data.inAppEnabled);
        setEmail(data.emailEnabled);
        setQuietHours({
          enabled: data.quietHoursEnabled,
          start: data.quietHoursStart,
          end: data.quietHoursEnd,
          timezone: data.quietHoursTimezone,
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [workspaceSlug]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceSlug}/notification-preferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'OWNER',
          'x-workspace-id': workspaceSlug,
          'x-user-id': 'mock-user-123',
        },
        body: JSON.stringify({
          inAppEnabled: inApp,
          emailEnabled: email,
          quietHours: {
            enabled: quietHours.enabled,
            start: quietHours.start,
            end: quietHours.end,
            timezone: quietHours.timezone,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Lưu cài đặt thất bại');
      }

      setSuccessMsg('Đã lưu cấu hình thông báo thành công! ✓');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-sm text-gray-500">Đang tải cấu hình...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Cài đặt thông báo</h1>
        <p className="text-sm text-gray-400 mt-1">Cấu hình cách hệ thống thông báo cho bạn về các hoạt động.</p>
      </div>

      {(error || successMsg) && (
        <div
          className={`p-3 rounded-xl border text-xs ${
            error ? 'bg-red-900/20 border-red-800/50 text-red-300' : 'bg-emerald-900/20 border-emerald-800/50 text-emerald-400'
          }`}
        >
          {error || successMsg}
        </div>
      )}

      <div className="bg-[#0c1323] border border-gray-800/60 rounded-2xl p-6 space-y-6">
        {/* In-app Notification Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold text-white">Thông báo trên ứng dụng (In-app)</h3>
            <p className="text-xs text-gray-400">Nhận thông báo trực tiếp qua Trung tâm thông báo trên trang web.</p>
          </div>
          <button
            onClick={() => setInApp(!inApp)}
            className={`w-11 h-6 rounded-full transition-all duration-200 border relative ${
              inApp ? 'bg-brand-600 border-brand-500' : 'bg-gray-800 border-gray-700'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white transition-all ${
                inApp ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Email Notification Toggle */}
        <div className="flex items-center justify-between border-t border-gray-800/40 pt-6">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold text-white">Thông báo qua Email</h3>
            <p className="text-xs text-gray-400">Nhận thông báo qua địa chỉ email liên kết của bạn.</p>
          </div>
          <button
            onClick={() => setEmail(!email)}
            className={`w-11 h-6 rounded-full transition-all duration-200 border relative ${
              email ? 'bg-brand-600 border-brand-500' : 'bg-gray-800 border-gray-700'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white transition-all ${
                email ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Quiet Hours Configuration */}
        <div className="border-t border-gray-800/40 pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-white">Chế độ Không làm phiền (Quiet Hours)</h3>
              <p className="text-xs text-gray-400">Tạm hoãn các thông báo email không khẩn cấp trong khoảng thời gian này.</p>
            </div>
            <button
              onClick={() => setQuietHours({ ...quietHours, enabled: !quietHours.enabled })}
              className={`w-11 h-6 rounded-full transition-all duration-200 border relative ${
                quietHours.enabled ? 'bg-brand-600 border-brand-500' : 'bg-gray-800 border-gray-700'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white transition-all ${
                  quietHours.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {quietHours.enabled && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl border border-gray-800/80 bg-gray-900/10">
              <div className="space-y-1">
                <label className="block text-[10px] text-gray-500 uppercase tracking-wider">Thời gian bắt đầu</label>
                <input
                  type="time"
                  value={quietHours.start}
                  onChange={(e) => setQuietHours({ ...quietHours, start: e.target.value })}
                  className="w-full bg-[#070a13] border border-gray-850 rounded-lg p-2 text-white text-xs focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] text-gray-500 uppercase tracking-wider">Thời gian kết thúc</label>
                <input
                  type="time"
                  value={quietHours.end}
                  onChange={(e) => setQuietHours({ ...quietHours, end: e.target.value })}
                  className="w-full bg-[#070a13] border border-gray-850 rounded-lg p-2 text-white text-xs focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] text-gray-500 uppercase tracking-wider">Múi giờ</label>
                <select
                  value={quietHours.timezone}
                  onChange={(e) => setQuietHours({ ...quietHours, timezone: e.target.value })}
                  className="w-full bg-[#070a13] border border-gray-850 rounded-lg p-2 text-white text-xs focus:outline-none"
                >
                  <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-500 hover:to-blue-500 text-white text-xs font-bold transition-all shadow-md disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  );
}
