import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useState, useMemo } from "react";
import { getLocalUser } from "@/lib/api-key";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { mcpCall } from "@/lib/mcp/mcp.functions";
import { IndianRupee, Save, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { getBudgetSettings, saveBudgetSettings } from "@/lib/budget-settings";

export const Route = createFileRoute("/settings")({
  component: () => <AppShell><SettingsPage /></AppShell>,
});

function fmtINR(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function SettingsPage() {
  const [apiKey, setApiKey]     = useState("");
  const [email, setEmail]       = useState("");
  const [salary, setSalary]     = useState(50000);
  const [limit, setLimit]       = useState(5000);

  useEffect(() => {
    const u = getLocalUser();
    if (u?.apiKey) setApiKey(u.apiKey);
    if (u?.email) {
      setEmail(u.email);
      const s = getBudgetSettings(u.email);
      setSalary(s.salary);
      setLimit(s.limit);
    }
  }, []);

  const callFn = useServerFn(mcpCall);

  // current month spend
  const today      = new Date();
  const month      = today.getMonth() + 1;
  const year       = today.getFullYear();
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd   = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;

  const spendQ = useQuery({
    enabled: !!apiKey,
    queryKey: ["summarize", monthStart, monthEnd, apiKey],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await callFn({ data: { apiKey, name: "summarize", args: { start_date: monthStart, end_date: monthEnd } } }) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return r.ok && Array.isArray(r.data) ? r.data as any[] : [];
    },
  });

  const totalSpent = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (spendQ.data ?? []).reduce((s: number, c: any) => s + Number(c.total_amount ?? 0), 0),
    [spendQ.data],
  );

  const pct       = limit > 0 ? Math.min(Math.round((totalSpent / limit) * 100), 100) : 0;
  const remaining = Math.max(0, limit - totalSpent);
  const isOver    = totalSpent > limit;
  const savingsPct = salary > 0 ? Math.round((limit / salary) * 100) : 0;
  const savings    = Math.max(0, salary - limit);

  const save = () => {
    saveBudgetSettings(email, salary, limit);
    toast.success("Settings saved");
  };

  // donut ring
  const R = 36, stroke = 7;
  const circ = 2 * Math.PI * R;
  const dash = (circ * pct) / 100;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your budget and spending limits</p>
      </div>

      {/* This Month's Budget */}
      <div className="glass rounded-2xl p-6">
        <div className="text-sm font-semibold mb-5">This Month's Budget</div>
        <div className="flex items-center gap-8">
          {/* Donut */}
          <div className="relative shrink-0" style={{ width: 96, height: 96 }}>
            <svg width={96} height={96} viewBox="0 0 96 96">
              {/* track */}
              <circle cx={48} cy={48} r={R} fill="none" stroke="hsl(var(--secondary))" strokeWidth={stroke} />
              {/* progress */}
              <circle
                cx={48} cy={48} r={R} fill="none"
                stroke={isOver ? "hsl(var(--destructive))" : "#22c55e"}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${circ}`}
                strokeLinecap="round"
                transform="rotate(-90 48 48)"
              />
              {/* dot at top */}
              <circle cx={48} cy={48 - R} r={3.5} fill={isOver ? "hsl(var(--destructive))" : "#22c55e"} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-lg font-bold leading-none ${isOver ? "text-destructive" : ""}`}>{pct}%</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">used</span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex-1 space-y-3">
            <Row label="Spent this month"   value={fmtINR(totalSpent)} highlight={isOver} />
            <Row label="Spending limit"     value={fmtINR(limit)}      highlight />
            <Row label="Monthly salary"     value={fmtINR(salary)}     highlight />
            <div className="pt-1 border-t border-border">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Progress</span>
                <span className={isOver ? "text-destructive font-medium" : ""}>{isOver ? "Over limit!" : `${fmtINR(remaining)} remaining`}</span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: isOver ? "hsl(var(--destructive))" : "#22c55e" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Budget Settings form */}
      <div className="glass rounded-2xl p-6 space-y-5">
        <div>
          <div className="text-sm font-semibold">Budget Settings</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Set your monthly salary and a spending threshold. The sidebar chart turns red when you hit the limit.
          </p>
        </div>

        {/* Monthly Salary */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium flex items-center gap-1.5">
            <IndianRupee className="size-3.5 text-primary" /> Monthly Salary
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
            <input
              type="number"
              value={salary}
              onChange={(e) => setSalary(Number(e.target.value))}
              min={0}
              className="w-full h-11 pl-7 pr-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">Used as reference for savings calculations</p>
        </div>

        {/* Monthly Spending Limit */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium flex items-center gap-1.5">
            <AlertCircle className="size-3.5 text-warning" /> Monthly Spending Limit (Threshold)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              min={0}
              className="w-full h-11 pl-7 pr-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">The sidebar chart turns red when your spending reaches this amount</p>
        </div>

        {/* Savings insight */}
        {salary > 0 && limit > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl bg-primary/10 border border-primary/20 px-4 py-3">
            <span className="text-primary mt-0.5">→</span>
            <p className="text-xs text-muted-foreground leading-relaxed">
              You're planning to spend{" "}
              <span className="text-foreground font-semibold">{savingsPct}%</span> of your salary.
              That leaves{" "}
              <span className="text-primary font-semibold">{fmtINR(savings)}</span> for savings.
            </p>
          </div>
        )}

        {/* Save */}
        <button
          onClick={save}
          className="w-full h-11 rounded-xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
        >
          <Save className="size-4" /> Save Settings
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "text-primary font-semibold" : "font-medium"}>{value}</span>
    </div>
  );
}
