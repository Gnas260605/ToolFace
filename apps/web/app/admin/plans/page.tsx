export default async function AdminPlansPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const response = await fetch(`${apiBase}/api/v1/admin/plans`, {
    cache: 'no-store',
    headers: { 'x-system-role': 'SYSTEM_ADMIN', 'x-workspace-id': 'system' },
  });
  const plans = response.ok ? await response.json() : [];

  return (
    <div className="min-h-screen bg-[#060b14] px-8 py-10 text-white">
      <h1 className="text-3xl font-bold">Plans</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan: any) => (
          <div key={plan.id} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{plan.code}</p>
            <p className="mt-3 text-xl font-semibold">{plan.name}</p>
            <p className="mt-2 text-sm text-slate-300">Trang thai: {plan.status}</p>
            <p className="mt-1 text-sm text-slate-300">Gia thang: {plan.monthlyPriceMinor ?? 0}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
