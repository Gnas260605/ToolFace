export default async function AdminFeatureFlagsPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const response = await fetch(`${apiBase}/api/v1/admin/feature-flags`, {
    cache: 'no-store',
    headers: { 'x-system-role': 'SYSTEM_ADMIN', 'x-workspace-id': 'system' },
  });
  const flags = response.ok ? await response.json() : [];

  return (
    <div className="min-h-screen bg-[#060b14] px-8 py-10 text-white">
      <h1 className="text-3xl font-bold">Feature flags</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {flags.map((flag: any) => (
          <div key={flag.id} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-lg font-semibold">{flag.name}</p>
            <p className="mt-1 text-sm text-slate-400">{flag.key}</p>
            <p className="mt-4 text-sm text-slate-300">
              Default: {String(flag.defaultEnabled)} | Rollout: {flag.rolloutPercentage}%
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
