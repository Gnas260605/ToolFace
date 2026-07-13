type SettingsPageProps = {
  params: { workspaceSlug: string };
};

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
  const settings = settingsRes.ok ? await settingsRes.json() : [];
  const whiteLabel = whiteLabelRes.ok ? await whiteLabelRes.json() : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/70">Settings</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Trung tam cai dat workspace</h1>
        <p className="mt-2 text-sm text-slate-300">
          Hien thi gia tri ke thua tu he thong, override cua workspace va cac rang buoc theo plan.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
        <h2 className="text-lg font-semibold text-white">Cai dat hieu luc</h2>
        <div className="mt-4 space-y-3">
          {settings.map((setting: any) => (
            <div key={setting.key} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">{setting.key}</p>
                  <p className="text-xs text-slate-400">
                    Nguon: {setting.source} | Inherited: {String(setting.inherited)}
                  </p>
                </div>
                <p className="text-xs text-slate-300">
                  {typeof setting.value === 'object' ? JSON.stringify(setting.value) : String(setting.value)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
        <h2 className="text-lg font-semibold text-white">White-label foundation</h2>
        <p className="mt-2 text-sm text-slate-300">
          {whiteLabel ? `Ten hien thi: ${whiteLabel.productDisplayName ?? 'Chua dat'} | Mau nhan: ${whiteLabel.accentColor ?? 'Mac dinh'}` : 'Workspace chua co ho so white-label.'}
        </p>
      </div>
    </div>
  );
}
