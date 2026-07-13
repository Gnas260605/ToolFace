export default async function AdminDashboardPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const response = await fetch(`${apiBase}/api/v1/admin`, {
    cache: 'no-store',
    headers: { 'x-system-role': 'SYSTEM_ADMIN', 'x-workspace-id': 'system' },
  });
  const data = response.ok ? await response.json() : null;

  return (
    <div className="min-h-screen bg-[#060b14] px-8 py-10 text-white">
      <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/70">Admin</p>
      <h1 className="mt-2 text-4xl font-bold">Bang dieu khien he thong</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Plans</p>
          <p className="mt-3 text-3xl font-semibold">{data?.plans ?? 0}</p>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Flags</p>
          <p className="mt-3 text-3xl font-semibold">{data?.featureFlags ?? 0}</p>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Webhook loi</p>
          <p className="mt-3 text-3xl font-semibold">{data?.failedWebhooks ?? 0}</p>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Thong bao</p>
          <p className="mt-3 text-3xl font-semibold">{data?.activeAnnouncements ?? 0}</p>
        </div>
      </div>
    </div>
  );
}
