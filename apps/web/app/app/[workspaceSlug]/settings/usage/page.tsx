type UsagePageProps = {
  params: { workspaceSlug: string };
};

export default async function UsagePage({ params }: UsagePageProps) {
  const workspaceId = params.workspaceSlug;
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const response = await fetch(`${apiBase}/api/v1/workspaces/${workspaceId}/usage`, {
    cache: 'no-store',
    headers: { 'x-user-role': 'OWNER', 'x-workspace-id': workspaceId },
  });
  const data = response.ok ? await response.json() : { metrics: [] };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/70">Usage</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Theo doi muc su dung</h1>
        <p className="mt-2 text-sm text-slate-300">
          Bieu do backend tong hop quota dang dung, quota du tru va gioi han hien hanh.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(data.metrics ?? []).map((metric: any) => (
          <div key={metric.metric} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{metric.metric}</p>
            <p className="mt-3 text-3xl font-semibold text-white">{metric.usedQuantity}</p>
            <p className="mt-2 text-sm text-slate-400">
              {metric.unlimited ? 'Khong gioi han' : `Gioi han ${metric.limitQuantity} | Du tru ${metric.reservedQuantity}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
