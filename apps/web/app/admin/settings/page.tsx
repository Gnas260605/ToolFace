export default async function AdminSettingsPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const response = await fetch(`${apiBase}/api/v1/admin/settings`, {
    cache: 'no-store',
    headers: { 'x-system-role': 'SYSTEM_ADMIN', 'x-workspace-id': 'system' },
  });
  const settings = response.ok ? await response.json() : [];

  return (
    <div className="min-h-screen bg-[#060b14] px-8 py-10 text-white">
      <h1 className="text-3xl font-bold">System settings</h1>
      <div className="mt-6 space-y-3">
        {settings.map((setting: any) => (
          <div key={setting.key} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-sm font-medium">{setting.key}</p>
            <p className="mt-1 text-xs text-slate-400">{String(typeof setting.maskedValue === 'object' ? JSON.stringify(setting.maskedValue) : setting.maskedValue)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
