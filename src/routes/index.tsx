import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { mcpCall } from "@/lib/mcp/mcp.functions";
import { getLocalUser } from "@/lib/api-key";
import { Wallet, FileText, ArrowDown, ArrowUp, Sparkles } from "lucide-react";
import { ChatPanel } from "@/components/chat/ChatPanel";

export const Route = createFileRoute("/")({ component: Dashboard });

function fmtINR(n: number) {
  return "₹" + (n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  // try common wrapper keys
  for (const k of ["expenses", "groups", "pending", "transactions", "items", "data"]) {
    if (Array.isArray(data[k])) return data[k];
  }
  return [];
}

function Dashboard() {
  return (
    <AppShell>
      <DashboardInner />
    </AppShell>
  );
}

function DashboardInner() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [name, setName] = useState<string>("");

  useEffect(() => {
    const u = getLocalUser();
    if (u) {
      setApiKey(u.apiKey);
      setName(u.name ?? u.email.split("@")[0]);
    }
  }, []);

  const callTool = useServerFn(mcpCall);

  const today = new Date();
  const toLocalISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const monthStart = toLocalISO(new Date(today.getFullYear(), today.getMonth(), 1));
  const monthEnd = toLocalISO(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  const summary = useQuery({
    enabled: !!apiKey,
    queryKey: ["summary", monthStart, monthEnd, apiKey],
    queryFn: async () => {
      const r = await callTool({ data: { apiKey: apiKey!, name: "summarize", args: { start_date: monthStart, end_date: monthEnd } } });
      if (!r.ok) throw new Error(r.error);
      // summarize returns an array: [{ category, total_amount, count }, ...]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const arr: any[] = Array.isArray(r.data) ? r.data : [];
      const by_category: Record<string, number> = {};
      let total = 0;
      for (const row of arr) {
        by_category[row.category] = row.total_amount;
        total += row.total_amount;
      }
      return { total: Math.round(total * 100) / 100, by_category };
    },
  });

  const pending = useQuery({
    enabled: !!apiKey,
    queryKey: ["pending", apiKey],
    queryFn: async () => {
      const r = await callTool({ data: { apiKey: apiKey!, name: "list_my_pending_approvals", args: {} } });
      if (!r.ok) throw new Error(r.error);
      return toArray(r.data);
    },
  });

  const groups = useQuery({
    enabled: !!apiKey,
    queryKey: ["groups", apiKey],
    queryFn: async () => {
      const r = await callTool({ data: { apiKey: apiKey!, name: "list_my_groups", args: {} } });
      if (!r.ok) throw new Error(r.error);
      return toArray(r.data);
    },
  });

  const recent = useQuery({
    enabled: !!apiKey,
    queryKey: ["recent-expenses", apiKey],
    queryFn: async () => {
      const r = await callTool({ data: { apiKey: apiKey!, name: "list_expenses", args: { start_date: monthStart, end_date: monthEnd } } });
      if (!r.ok) throw new Error(r.error);
      return toArray(r.data)
        .sort((a: any, b: any) => {
          const ta = new Date(a.created_at || a.expense_date || 0).getTime();
          const tb = new Date(b.created_at || b.expense_date || 0).getTime();
          return tb - ta;
        })
        .slice(0, 5);
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalSpent = (summary.data as any)?.total ?? 0;
  const pendingCount = pending.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Good {greeting()}, {name || "friend"}! <span className="ml-1">👋</span>
          </h1>
          <p className="text-sm text-muted-foreground">Here's what's happening with your finances today.</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard color="kpi-purple"
          label={`Total Spent (${monthLabel(today)})`}
          value={summary.isLoading ? "…" : fmtINR(totalSpent)}
          hint={summary.isError ? "Error loading" : "This month"}
          icon={<Wallet className="size-5 text-primary" />} />
        <KpiCard color="kpi-info"
          label="Pending Approvals"
          value={pending.isLoading ? "…" : String(pendingCount)}
          hint={pending.isError ? "Error loading" : pendingCount > 0 ? "Action needed" : "All clear"}
          icon={<FileText className="size-5 text-info" />} />
        <KpiCard color="kpi-success"
          label="Active Groups"
          value={groups.isLoading ? "…" : String(groups.data?.length ?? 0)}
          hint={groups.isError ? "Error loading" : "You're a member of"}
          icon={<ArrowUp className="size-5 text-success" />} />
        <KpiCard color="kpi-warning"
          label="Categories Tracked"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          value={String(Object.keys((summary.data as any)?.by_category ?? {}).length || 0)}
          hint="In current month"
          icon={<ArrowDown className="size-5 text-warning" />} />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass rounded-2xl overflow-hidden flex flex-col" style={{ minHeight: 560 }}>
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <div className="font-semibold">AI Workspace</div>
            <div className="ml-auto text-xs text-muted-foreground">Streaming · MCP tools</div>
          </div>
          <ChatPanel apiKey={apiKey ?? ""} />
        </div>

        <div className="space-y-6">
          {/* Groups */}
          <div className="glass rounded-2xl">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="font-semibold">Your Groups</div>
              <Link to="/groups" className="text-xs text-primary hover:underline">View All</Link>
            </div>
            <div className="p-3 max-h-80 overflow-auto">
              {groups.isLoading && <div className="text-sm text-muted-foreground p-3">Loading…</div>}
              {groups.isError && <div className="text-sm text-destructive p-3">{(groups.error as Error).message}</div>}
              {(groups.data ?? [])
                .slice()
                .sort((a: any, b: any) => {
                  const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
                  const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
                  return tb - ta;
                })
                .slice(0, 5)
                .map((g, i) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const grp: any = g;
                return (
                  <div key={i} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent/40">
                    <div className="size-9 rounded-lg bg-secondary grid place-items-center text-foreground text-sm">
                      {String(grp.name ?? "G").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{grp.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{grp.kind ?? "group"}</div>
                    </div>
                  </div>
                );
              })}
              {!groups.isLoading && !groups.isError && (groups.data?.length ?? 0) === 0 && (
                <div className="text-sm text-muted-foreground p-3">No groups yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SpendingOverview
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          byCategory={(summary.data as any)?.by_category ?? {}}
          total={totalSpent}
          loading={summary.isLoading}
          error={summary.isError ? (summary.error as Error).message : undefined}
        />
        <ActivityFeed expenses={recent.data ?? []} loading={recent.isLoading} error={recent.isError ? (recent.error as Error).message : undefined} />
      </div>
    </div>
  );
}

const PIE_COLORS = ["#a78bfa", "#60a5fa", "#fbbf24", "#34d399", "#f472b6", "#94a3b8"];

function SpendingOverview({ byCategory, total, loading, error }: {
  byCategory: Record<string, number>;
  total: number;
  loading: boolean;
  error?: string;
}) {
  const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const sum = entries.reduce((s, [, v]) => s + v, 0) || 1;
  let acc = 0;
  const stops = entries.map(([, v], i) => {
    const start = (acc / sum) * 100;
    acc += v;
    const end = (acc / sum) * 100;
    return `${PIE_COLORS[i % PIE_COLORS.length]} ${start}% ${end}%`;
  }).join(", ");
  const bg = entries.length > 0
    ? `conic-gradient(${stops})`
    : `conic-gradient(hsl(var(--muted)) 0 100%)`;

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="font-semibold">Spending Overview</div>
        <div className="text-xs text-muted-foreground">This Month</div>
      </div>
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {error && <div className="text-sm text-destructive">{error}</div>}
      {!loading && !error && entries.length === 0 && (
        <div className="text-sm text-muted-foreground">No spending recorded this month.</div>
      )}
      {!loading && !error && entries.length > 0 && (
        <div className="flex items-center gap-6">
          <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
            <div className="absolute inset-0 rounded-full" style={{ background: bg }} />
            <div className="absolute inset-4 rounded-full bg-card grid place-items-center">
              <div className="text-center">
                <div className="text-lg font-semibold">{"₹" + total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
                <div className="text-[11px] text-muted-foreground">Total</div>
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            {entries.map(([cat, v], i) => {
              const pct = ((v / sum) * 100).toFixed(1);
              return (
                <div key={cat} className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="flex-1 truncate">{cat}</span>
                  <span className="font-medium">{"₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                  <span className="text-xs text-muted-foreground w-12 text-right">({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function timeAgo(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const s = Math.max(1, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const dy = Math.floor(h / 24); return `${dy}d ago`;
}

function ActivityFeed({ expenses, loading, error }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expenses: any[];
  loading: boolean;
  error?: string;
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="font-semibold">Activity Feed</div>
        <a href="/expenses" className="text-xs text-primary hover:underline">View all</a>
      </div>
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {error && <div className="text-sm text-destructive">{error}</div>}
      {!loading && !error && expenses.length === 0 && (
        <div className="text-sm text-muted-foreground">No recent activity.</div>
      )}
      {!loading && !error && expenses.length > 0 && (
        <div className="space-y-2">
          {expenses.map((e, i) => {
            const cat = String(e.category ?? "General");
            const note = e.note || cat;
            const when = e.created_at || e.date || e.expense_date;
            const amt = Number(e.amount ?? 0);
            return (
              <div key={e.id ?? i} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent/40">
                <div className="size-9 rounded-full bg-primary/15 grid place-items-center text-primary text-sm font-semibold shrink-0">
                  {cat.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm"><span className="font-medium">You</span> added an expense</div>
                  <div className="text-xs text-muted-foreground truncate">{note}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold">{"₹" + amt.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
                  <div className="text-[11px] text-muted-foreground">{timeAgo(when)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}
function monthLabel(d: Date) { return d.toLocaleString("en-US", { month: "short" }); }

function KpiCard({ color, label, value, hint, icon }: {
  color: string; label: string; value: string; hint: string; icon: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl p-4 border border-border ${color}`}>
      <div className="flex items-start justify-between">
        <div className="text-sm text-foreground/80">{label}</div>
        <div className="size-9 rounded-lg bg-background/30 grid place-items-center">{icon}</div>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
