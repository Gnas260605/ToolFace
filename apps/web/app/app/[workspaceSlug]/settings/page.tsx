/* eslint-disable @typescript-eslint/no-explicit-any */
import SettingsForm from './settings-form';

type SettingsPageProps = {
  params: { workspaceSlug: string };
};

async function safeJson<T>(res: Response, fallback: T): Promise<T> {
  if (!res.ok) return fallback;
  try {
    const text = await res.text();
    if (!text || !text.trim()) return fallback;
    return JSON.parse(text) as T;
  } catch (_e) {
    return fallback;
  }
}

export default async function WorkspaceSettingsPage({ params }: SettingsPageProps) {
  const workspaceId = params.workspaceSlug;
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const [settingsRes, whiteLabelRes] = await Promise.all([
    fetch(`${apiBase}/api/v1/workspaces/${workspaceId}/settings/effective`, {
      cache: 'no-store',
      headers: { 'x-user-role': 'OWNER', 'x-workspace-id': workspaceId },
    }),
    fetch(`${apiBase}/api/v1/workspaces/${workspaceId}/white-label`, {
      cache: 'no-store',
      headers: { 'x-user-role': 'OWNER', 'x-workspace-id': workspaceId },
    }),
  ]);
  const settings = await safeJson<any[]>(settingsRes, []);
  const whiteLabel = await safeJson<any>(whiteLabelRes, null);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="space-y-1">
        <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-accent-400">Cài đặt</p>
        <h1 className="text-2xl font-display italic text-zinc-100">Trung tâm cấu hình</h1>
        <p className="text-sm text-zinc-500 max-w-lg">
          Quản lý API keys, cấu hình AI provider, chính sách biên tập và thương hiệu.
        </p>
      </div>

      {/* Settings Form */}
      <SettingsForm workspaceId={workspaceId} apiBase={apiBase} initialSettings={settings} />

      {/* White-label Section */}
      <div className="rounded-xl border border-zinc-800/50 bg-surface-raised p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">White-label</h2>
            <p className="text-xs text-zinc-500">Tuỳ chỉnh thương hiệu cho workspace</p>
          </div>
        </div>
        <div className="pl-11">
          {whiteLabel ? (
            <div className="flex flex-wrap gap-4 text-xs">
              <div>
                <span className="text-zinc-600">Tên hiển thị:</span>
                <span className="text-zinc-300 ml-1 font-medium">{whiteLabel.productDisplayName ?? 'Chưa đặt'}</span>
              </div>
              <div>
                <span className="text-zinc-600">Màu nhấn:</span>
                <span className="text-zinc-300 ml-1 font-medium">{whiteLabel.accentColor ?? 'Mặc định'}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-600">Chưa cấu hình white-label cho workspace này.</p>
          )}
        </div>
      </div>
    </div>
  );
}
