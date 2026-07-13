type PageProps = {
  params: { workspaceSlug: string };
};

async function getBillingData(workspaceId: string) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const [subscriptionRes, usageRes] = await Promise.all([
    fetch(`${apiBase}/api/v1/workspaces/${workspaceId}/subscription`, {
      cache: 'no-store',
      headers: { 'x-user-role': 'OWNER', 'x-workspace-id': workspaceId },
    }),
    fetch(`${apiBase}/api/v1/workspaces/${workspaceId}/usage`, {
      cache: 'no-store',
      headers: { 'x-user-role': 'OWNER', 'x-workspace-id': workspaceId },
    }),
  ]);

  return {
    subscription: subscriptionRes.ok ? await subscriptionRes.json() : null,
    usage: usageRes.ok ? await usageRes.json() : null,
  };
}

export default async function BillingPage({ params }: PageProps) {
  const workspaceId = params.workspaceSlug;
  const data = await getBillingData(workspaceId);
  const subscription = data.subscription?.subscription;
  const plan = data.subscription?.plan;
  const metrics = data.usage?.metrics ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/70">Billing</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Goi dich vu va thanh toan</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">
          Quan ly trial, nang cap, gia han va theo doi cac gioi han dang ap dung cho workspace.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-cyan-400/20 bg-slate-950/70 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Goi hien tai</p>
          <p className="mt-3 text-2xl font-semibold text-white">{plan?.name ?? 'Chua co goi'}</p>
          <p className="mt-2 text-sm text-slate-300">Trang thai: {subscription?.status ?? 'INCOMPLETE'}</p>
        </div>
        <div className="rounded-2xl border border-emerald-400/20 bg-slate-950/70 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Ky hien tai</p>
          <p className="mt-3 text-sm text-white">
            {subscription?.currentPeriodStart ? new Date(subscription.currentPeriodStart).toLocaleString('vi-VN') : 'Chua bat dau'}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            den {subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleString('vi-VN') : 'N/A'}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-slate-950/70 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Trial</p>
          <p className="mt-3 text-sm text-white">
            {subscription?.trialEndsAt ? `Ket thuc ${new Date(subscription.trialEndsAt).toLocaleString('vi-VN')}` : 'Khong co trial'}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            {subscription?.cancelAtPeriodEnd ? 'Da yeu cau huy vao cuoi ky.' : 'Dang duy tri binh thuong.'}
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Chi so gioi han</h2>
            <p className="text-sm text-slate-400">Cac muc gan day de danh gia nguy co vuot quota.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {metrics.map((metric: any) => (
            <div key={metric.metric} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">{metric.metric}</p>
                <p className="text-xs text-slate-400">
                  {metric.unlimited ? 'Unlimited' : `${metric.usedQuantity}/${metric.limitQuantity}`}
                </p>
              </div>
              {!metric.unlimited ? (
                <div className="mt-3 h-2 rounded-full bg-slate-800">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                    style={{ width: `${Math.min(100, Math.round((metric.usedQuantity / Math.max(metric.limitQuantity, 1)) * 100))}%` }}
                  />
                </div>
              ) : null}
              <p className="mt-3 text-xs text-slate-400">
                Con lai: {metric.unlimited ? 'Khong gioi han' : metric.remaining}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
