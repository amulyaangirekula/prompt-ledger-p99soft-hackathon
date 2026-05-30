import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useState, useMemo } from "react";
import { getLocalUser } from "@/lib/api-key";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { mcpCall } from "@/lib/mcp/mcp.functions";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, Cell,
} from "recharts";

export const Route = createFileRoute("/reports")({
  component: () => <AppShell><ReportsPage /></AppShell>,
});

function fmtINR(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
function fmtShort(n: number) {
  if (n >= 100000) return "₹" + (n / 100000).toFixed(1) + "L";
  if (n >= 1000) return "₹" + (n / 1000).toFixed(0) + "k";
  return "₹" + Math.round(n);
}

const PALETTE = ["#34d399", "#f87171", "#a78bfa", "#60a5fa", "#fbbf24", "#fb923c", "#38bdf8", "#818cf8"];
const CAT_COLOR: Record<string, string> = {
  Travel: "#34d399", Food: "#f87171", Shopping: "#a78bfa",
  Transportation: "#60a5fa", Entertainment: "#fbbf24",
  Healthcare: "#4ade80", Groceries: "#fb923c", Accommodation: "#38bdf8",
};
function cc(name: string, i: number) { return CAT_COLOR[name] ?? PALETTE[i % PALETTE.length]; }

type Period = "W-4" | "Month" | "Quarter" | "Year";

function ReportsPage() {
  const [apiKey, setApiKey] = useState("");
  const [period, setPeriod] = useState<Period>("Month");
  const today = new Date();
  const curMonth = today.getMonth() + 1;
  const curYear  = today.getFullYear();

  useEffect(() => {
    const u = getLocalUser();
    if (u?.apiKey) setApiKey(u.apiKey);
  }, []);

  const callFn = useServerFn(mcpCall);

  // ── date range driven by period ──────────────────────────────────────────
  const { rangeStart, rangeEnd, prevStart, prevEnd, months } = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

    if (period === "W-4") {
      // last 28 days
      const end   = new Date(today);
      const start = new Date(today); start.setDate(start.getDate() - 27);
      const pEnd   = new Date(start); pEnd.setDate(pEnd.getDate() - 1);
      const pStart = new Date(pEnd);  pStart.setDate(pStart.getDate() - 27);
      const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
      return { rangeStart: fmt(start), rangeEnd: fmt(end), prevStart: fmt(pStart), prevEnd: fmt(pEnd), months: [] as number[] };
    }
    if (period === "Month") {
      const rs = `${curYear}-${pad(curMonth)}-01`;
      const re = `${curYear}-${pad(curMonth)}-${pad(lastDay(curYear, curMonth))}`;
      const pm = curMonth === 1 ? 12 : curMonth - 1;
      const py = curMonth === 1 ? curYear - 1 : curYear;
      const ps = `${py}-${pad(pm)}-01`;
      const pe = `${py}-${pad(pm)}-${pad(lastDay(py, pm))}`;
      return { rangeStart: rs, rangeEnd: re, prevStart: ps, prevEnd: pe, months: [curMonth] };
    }
    if (period === "Quarter") {
      const q     = Math.floor((curMonth - 1) / 3);
      const qm1   = q * 3 + 1;
      const qm3   = q * 3 + 3;
      const rs    = `${curYear}-${pad(qm1)}-01`;
      const re    = `${curYear}-${pad(qm3)}-${pad(lastDay(curYear, qm3))}`;
      const pqm1  = qm1 - 3 <= 0 ? qm1 + 9 : qm1 - 3;
      const pqm3  = qm3 - 3 <= 0 ? qm3 + 9 : qm3 - 3;
      const py    = qm1 - 3 <= 0 ? curYear - 1 : curYear;
      const ps    = `${py}-${pad(pqm1)}-01`;
      const pe    = `${py}-${pad(pqm3)}-${pad(lastDay(py, pqm3))}`;
      return { rangeStart: rs, rangeEnd: re, prevStart: ps, prevEnd: pe, months: [qm1, qm1+1, qm3] };
    }
    // Year
    const rs = `${curYear}-01-01`;
    const re = `${curYear}-12-31`;
    const ps = `${curYear-1}-01-01`;
    const pe = `${curYear-1}-12-31`;
    return { rangeStart: rs, rangeEnd: re, prevStart: ps, prevEnd: pe, months: [1,2,3,4,5,6,7,8,9,10,11,12] };
  }, [period, curMonth, curYear]);

  // For monthly_report we still use current month (it's a fixed tool)
  const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
  const prevYear  = curMonth === 1 ? curYear - 1 : curYear;

  // ── queries ──────────────────────────────────────────────────────────────

  const reportQ = useQuery({
    enabled: !!apiKey,
    queryKey: ["monthly_report", curMonth, curYear, apiKey],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await callFn({ data: { apiKey, name: "monthly_report", args: { month: curMonth, year: curYear } } }) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return r.ok ? r.data as any : null;
    },
  });

  const prevReportQ = useQuery({
    enabled: !!apiKey,
    queryKey: ["monthly_report", prevMonth, prevYear, apiKey],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await callFn({ data: { apiKey, name: "monthly_report", args: { month: prevMonth, year: prevYear } } }) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return r.ok ? r.data as any : null;
    },
  });

  const summarizeQ = useQuery({
    enabled: !!apiKey,
    queryKey: ["summarize", rangeStart, rangeEnd, apiKey],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await callFn({ data: { apiKey, name: "summarize", args: { start_date: rangeStart, end_date: rangeEnd } } }) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return r.ok && Array.isArray(r.data) ? r.data as any[] : [];
    },
  });

  const expensesQ = useQuery({
    enabled: !!apiKey,
    queryKey: ["expenses", rangeStart, rangeEnd, apiKey],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await callFn({ data: { apiKey, name: "list_expenses", args: { start_date: rangeStart, end_date: rangeEnd } } }) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return r.ok && Array.isArray(r.data) ? r.data as any[] : [];
    },
  });

  // prev period expenses for trend comparison
  const prevExpensesQ = useQuery({
    enabled: !!apiKey,
    queryKey: ["expenses", prevStart, prevEnd, apiKey],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await callFn({ data: { apiKey, name: "list_expenses", args: { start_date: prevStart, end_date: prevEnd } } }) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return r.ok && Array.isArray(r.data) ? r.data as any[] : [];
    },
  });

  const budgetsQ = useQuery({
    enabled: !!apiKey,
    queryKey: ["budgets", apiKey],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await callFn({ data: { apiKey, name: "list_budgets", args: {} } }) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return r.ok && Array.isArray(r.data) ? r.data as any[] : [];
    },
  });

  const loading = summarizeQ.isLoading || expensesQ.isLoading;

  // ── derive data ───────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rep: any  = reportQ.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prev: any = prevReportQ.data;

  // totals — monthly_report is authoritative; fall back to summing summarize
  const repTotal   = Number(rep?.total_spent ?? 0);
  const sumTotal   = (summarizeQ.data ?? []).reduce((s: number, c: any) => s + Number(c.total_amount ?? 0), 0);
  const totalSpent = repTotal > 0 ? repTotal : sumTotal;

  const prevTotal   = Number(prev?.total_spent ?? 0);
  const txCount     = Number(rep?.transaction_count ?? (expensesQ.data?.length ?? 0));
  const prevTxCount = Number(prev?.transaction_count ?? 0);
  const pctChange   = prevTotal > 0 ? ((totalSpent - prevTotal) / prevTotal) * 100 : 0;
  const txChange    = prevTxCount > 0 ? txCount - prevTxCount : 0;
  const days        = new Date(curYear, curMonth, 0).getDate();
  const avgDaily    = days > 0 ? totalSpent / days : 0;
  const prevAvg     = days > 0 ? prevTotal / days : 0;
  const avgChange   = prevAvg > 0 ? ((avgDaily - prevAvg) / prevAvg) * 100 : 0;

  // budgets
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bList: any[] = budgetsQ.data ?? [];
  const bTotal   = bList.reduce((s, b) => s + Number(b.amount ?? 0), 0);
  const bSpent   = bList.reduce((s, b) => s + Number(b.actual_spend ?? b.spent ?? 0), 0);
  const bRemain  = Math.max(0, bTotal - bSpent);
  const bPct     = bTotal > 0 ? Math.round((bRemain / bTotal) * 100) : 0;

  // categories — normalise monthly_report shape vs summarize shape
  const topCategories = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fromReport: any[] = rep?.top_categories ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fromSum: any[]    = summarizeQ.data ?? [];
    const grand = totalSpent || 1;

    if (fromReport.length > 0) {
      // shape: { category, total, percentage }
      return fromReport.map((c: any) => ({
        category:   String(c.category ?? "Other"),
        total:      Number(c.total ?? 0),
        percentage: Number(c.percentage ?? ((Number(c.total ?? 0) / grand) * 100)),
      }));
    }
    if (fromSum.length > 0) {
      // shape: { category, total_amount, count }
      const s = fromSum.reduce((acc: number, c: any) => acc + Number(c.total_amount ?? 0), 0) || 1;
      return fromSum.map((c: any) => ({
        category:   String(c.category ?? "Other"),
        total:      Number(c.total_amount ?? 0),
        percentage: (Number(c.total_amount ?? 0) / s) * 100,
      })).sort((a, b) => b.total - a.total);
    }
    return [];
  }, [rep, summarizeQ.data, totalSpent]);

  // ── trend chart — built from raw expenses, grouped by period ────────────
  const trendData = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const curr: any[] = expensesQ.data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevList: any[] = prevExpensesQ.data ?? [];

    if (period === "Month" || period === "W-4") {
      // group by day-of-month (1–31) or day offset (1–28)
      const currMap: Record<number, number> = {};
      const prevMap: Record<number, number> = {};
      for (const e of curr) {
        const d = Number(String(e.expense_date ?? "").slice(8) || 0);
        currMap[d] = (currMap[d] ?? 0) + Number(e.amount ?? 0);
      }
      for (const e of prevList) {
        const d = Number(String(e.expense_date ?? "").slice(8) || 0);
        prevMap[d] = (prevMap[d] ?? 0) + Number(e.amount ?? 0);
      }
      const maxDay = period === "W-4" ? 28 : new Date(curYear, curMonth, 0).getDate();
      return Array.from({ length: maxDay }, (_, i) => ({
        label: i + 1,
        curr:  currMap[i + 1] ?? 0,
        prev:  prevMap[i + 1] ?? 0,
      }));
    }

    if (period === "Quarter") {
      // group by week number within quarter (1–13)
      const currMap: Record<number, number> = {};
      const prevMap: Record<number, number> = {};
      const weekOf = (dateStr: string) => {
        const d = new Date(dateStr);
        const start = new Date(rangeStart);
        return Math.floor((d.getTime() - start.getTime()) / (7 * 86400000)) + 1;
      };
      const prevWeekOf = (dateStr: string) => {
        const d = new Date(dateStr);
        const start = new Date(prevStart);
        return Math.floor((d.getTime() - start.getTime()) / (7 * 86400000)) + 1;
      };
      for (const e of curr) { const w = weekOf(e.expense_date ?? ""); if (w >= 1 && w <= 13) currMap[w] = (currMap[w] ?? 0) + Number(e.amount ?? 0); }
      for (const e of prevList) { const w = prevWeekOf(e.expense_date ?? ""); if (w >= 1 && w <= 13) prevMap[w] = (prevMap[w] ?? 0) + Number(e.amount ?? 0); }
      return Array.from({ length: 13 }, (_, i) => ({ label: `W${i + 1}`, curr: currMap[i + 1] ?? 0, prev: prevMap[i + 1] ?? 0 }));
    }

    // Year — group by month (Jan–Dec)
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const currMap: Record<number, number> = {};
    const prevMap: Record<number, number> = {};
    for (const e of curr) { const m = Number(String(e.expense_date ?? "").slice(5, 7) || 0); currMap[m] = (currMap[m] ?? 0) + Number(e.amount ?? 0); }
    for (const e of prevList) { const m = Number(String(e.expense_date ?? "").slice(5, 7) || 0); prevMap[m] = (prevMap[m] ?? 0) + Number(e.amount ?? 0); }
    return Array.from({ length: 12 }, (_, i) => ({ label: MONTHS[i], curr: currMap[i + 1] ?? 0, prev: prevMap[i + 1] ?? 0 }));
  }, [period, expensesQ.data, prevExpensesQ.data, rangeStart, prevStart, curYear, curMonth]);

  // weekly bar — always from current expenses
  const weeklyData = useMemo(() => {
    const w: Record<string, number> = { W1: 0, W2: 0, W3: 0, W4: 0 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of (expensesQ.data ?? []) as any[]) {
      const day = Number(String(e.expense_date ?? "").slice(8) || 0);
      const k   = day <= 7 ? "W1" : day <= 14 ? "W2" : day <= 21 ? "W3" : "W4";
      w[k] += Number(e.amount ?? 0);
    }
    return Object.entries(w).map(([name, value]) => ({ name, value }));
  }, [expensesQ.data]);

  // top transactions — real expenses sorted by amount
  const topTx = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: any[] = expensesQ.data ?? [];
    if (list.length > 0) {
      return [...list]
        .sort((a, b) => Number(b.amount ?? 0) - Number(a.amount ?? 0))
        .slice(0, 4)
        .map((e: any) => ({
          label:    String(e.note || e.category || "Expense"),
          category: String(e.category ?? "Other"),
          sub:      `${e.category ?? "Other"} · ${String(e.expense_date ?? "").slice(5).replace("-", " ")}`,
          amount:   Number(e.amount ?? 0),
        }));
    }
    return topCategories.slice(0, 4).map((c) => ({
      label:    `${c.category} expense`,
      category: c.category,
      sub:      `${c.category} · ${today.getDate()} ${today.toLocaleString("en", { month: "short" })}`,
      amount:   c.total,
    }));
  }, [expensesQ.data, topCategories]);

  // AI insights
  const insights = useMemo(() => {
    if (!topCategories.length) return [];
    const ins = [];
    const top = topCategories[0];
    ins.push({ icon: TrendingUp, color: "text-destructive", title: `${top.category} is your top spend`, desc: `${top.percentage.toFixed(0)}% of spending on ${top.category.toLowerCase()} this month.` });
    if (bRemain > 0) ins.push({ icon: TrendingDown, color: "text-success", title: "Under budget", desc: `You're ${fmtINR(bRemain)} below your monthly limit.` });
    if (topCategories[1]) ins.push({ icon: TrendingUp, color: "text-warning", title: `${topCategories[1].category} up ${topCategories[1].percentage.toFixed(0)}%`, desc: `${topCategories[1].category} spending slightly higher than last month.` });
    return ins.slice(0, 3);
  }, [topCategories, bRemain]);

  // donut
  const donutSegs = useMemo(() => {
    const entries = topCategories.slice(0, 6);
    const sum = entries.reduce((s, c) => s + c.total, 0) || 1;
    let acc = 0;
    return entries.map((c, i) => {
      const start = (acc / sum) * 360;
      acc += c.total;
      return { ...c, color: cc(c.category, i), start, end: (acc / sum) * 360 };
    });
  }, [topCategories]);

  const noData = !loading && totalSpent === 0 && topCategories.length === 0;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Visual breakdown of your spending</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-secondary/60 border border-border p-1">
          {(["W-4", "Month", "Quarter", "Year"] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`h-7 px-3 rounded-lg text-xs font-medium transition-colors ${period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Banners */}
      {!apiKey && (
        <div className="rounded-xl bg-warning/10 border border-warning/30 px-4 py-3 text-xs text-warning">
          Not signed in — no API key found. Please sign in again.
        </div>
      )}
      {reportQ.isError && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/30 px-4 py-3 text-xs text-destructive">
          Error: {String((reportQ.error as Error)?.message ?? "Failed to load report")}
        </div>
      )}
      {apiKey && noData && (
        <div className="rounded-xl bg-secondary/60 border border-border px-4 py-3 text-xs text-muted-foreground">
          No expenses found for this period. Add some expenses to see your report.
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          color="kpi-purple"
          icon={<TrendingUp className="size-5 text-primary" />}
          label="MONTHLY TOTAL"
          value={loading ? "…" : fmtINR(totalSpent)}
          hint={`${Math.abs(pctChange).toFixed(0)}% vs last month`}
          up={pctChange >= 0}
        />
        <KpiCard
          color="kpi-info"
          icon={<TrendingDown className="size-5 text-info" />}
          label="TRANSACTIONS"
          value={loading ? "…" : String(txCount)}
          hint={`${txChange >= 0 ? "+" : ""}${txChange} last month`}
          up={txChange >= 0}
        />
        <KpiCard
          color="kpi-success"
          icon={<TrendingUp className="size-5 text-success" />}
          label="AVG. DAILY SPEND"
          value={loading ? "…" : fmtINR(Math.round(avgDaily))}
          hint={`${Math.abs(avgChange).toFixed(0)}% vs last month`}
          up={avgChange >= 0}
        />
        <KpiCard
          color="kpi-warning"
          icon={<Minus className="size-5 text-warning" />}
          label="BUDGET REMAINING"
          value={budgetsQ.isLoading ? "…" : fmtINR(bRemain)}
          hint={`${bPct}% still available`}
          up noArrow
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Daily trend */}
        <div className="lg:col-span-2 glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Daily Spending Trend</span>
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-6 h-0.5 rounded" style={{ background: "#a78bfa" }} /> This {period === "Year" ? "year" : period === "Quarter" ? "quarter" : "month"}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-6 border-t border-dashed border-muted-foreground" /> Last {period === "Year" ? "year" : period === "Quarter" ? "quarter" : "month"}
              </span>
            </div>
          </div>
          {loading ? (
            <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
          ) : trendData.every(d => d.curr === 0) ? (
            <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#a78bfa" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false} axisLine={false}
                  interval={period === "Month" ? 3 : period === "W-4" ? 3 : period === "Quarter" ? 1 : 0}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false} axisLine={false}
                  tickFormatter={fmtShort}
                  tickCount={5}
                />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number, name: string) => [fmtINR(v), name === "curr" ? "This period" : "Last period"]}
                  labelFormatter={(l) => `${period === "Month" || period === "W-4" ? "Day " : ""}${l}`}
                />
                {/* Last period — dashed grey */}
                <Line
                  type="monotone" dataKey="prev"
                  stroke="hsl(var(--muted-foreground))" strokeWidth={1.5}
                  strokeDasharray="5 4" dot={false} strokeOpacity={0.5}
                />
                {/* Current period — glowing purple with area fill */}
                <Line
                  type="monotone" dataKey="curr"
                  stroke="#a78bfa" strokeWidth={2.5}
                  dot={(props) => {
                    const { cx, cy, value } = props;
                    if (!value) return <circle key={`dot-${cx}`} cx={cx} cy={cy} r={2.5} fill="#a78bfa" fillOpacity={0.4} />;
                    return <circle key={`dot-${cx}`} cx={cx} cy={cy} r={3.5} fill="#a78bfa" stroke="#c4b5fd" strokeWidth={1.5} />;
                  }}
                  activeDot={{ r: 5, fill: "#a78bfa", stroke: "#c4b5fd", strokeWidth: 2 }}
                  style={{ filter: "drop-shadow(0 0 6px #a78bfa88)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Donut */}
        <div className="glass rounded-2xl p-5 flex flex-col">
          <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase mb-4">Spending by Category</span>
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
          ) : donutSegs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">No data</div>
          ) : (
            <div className="flex flex-col items-center gap-4 flex-1">
              <SvgDonut segs={donutSegs} total={totalSpent} />
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                {donutSegs.map((s) => (
                  <div key={s.category} className="flex items-center gap-1.5 text-[11px]">
                    <span className="size-2 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-muted-foreground">{s.category}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Amount by category + weekly bar */}
        <div className="glass rounded-2xl p-5 flex flex-col gap-4">
          <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Amount by Category</span>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : topCategories.length === 0 ? (
            <div className="text-sm text-muted-foreground">No data this month.</div>
          ) : (
            <div className="space-y-3 flex-1">
              {topCategories.slice(0, 4).map((c, i) => (
                <div key={c.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{c.category}</span>
                    <span className="text-muted-foreground">{fmtINR(c.total)} <span className="ml-1">{c.percentage.toFixed(0)}%</span></span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(c.percentage, 100)}%`, background: cc(c.category, i) }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={weeklyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barSize={28}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} formatter={(v: number) => [fmtINR(v)]} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {weeklyData.map((_, j) => (
                  <Cell key={j} fill={j === weeklyData.length - 1 ? "#a78bfa" : "hsl(var(--secondary))"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top transactions */}
        <div className="glass rounded-2xl p-5">
          <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase block mb-4">Top Transactions</span>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : topTx.length === 0 ? (
            <div className="text-sm text-muted-foreground">No transactions this month.</div>
          ) : (
            <div className="space-y-3">
              {topTx.map((tx, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="size-2 rounded-full shrink-0 mt-0.5" style={{ background: cc(tx.category, i) }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{tx.label}</div>
                    <div className="text-[11px] text-muted-foreground">{tx.sub}</div>
                  </div>
                  <span className="text-sm font-semibold text-destructive shrink-0">-{fmtINR(tx.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI insights */}
        <div className="glass rounded-2xl p-5">
          <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase block mb-4">AI Insights</span>
          {loading ? (
            <div className="text-sm text-muted-foreground">Analyzing…</div>
          ) : insights.length === 0 ? (
            <div className="text-sm text-muted-foreground">Add expenses to see insights.</div>
          ) : (
            <div className="space-y-4">
              {insights.map((ins, i) => {
                const Icon = ins.icon;
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className="size-7 rounded-lg bg-secondary/60 grid place-items-center shrink-0 mt-0.5">
                      <Icon className={`size-3.5 ${ins.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold">{ins.title}</div>
                      <div className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{ins.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Card — matches dashboard style
// ---------------------------------------------------------------------------
function KpiCard({ color, icon, label, value, hint, up, noArrow }: {
  color: string; icon: React.ReactNode;
  label: string; value: string; hint: string; up: boolean; noArrow?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-4 border border-border ${color}`}>
      <div className="flex items-start justify-between">
        <div className="text-[10px] font-semibold tracking-widest text-foreground/70 uppercase">{label}</div>
        <div className="size-9 rounded-lg bg-background/30 grid place-items-center shrink-0">{icon}</div>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      <div className={`mt-1 flex items-center gap-1 text-xs ${noArrow ? "text-muted-foreground" : up ? "text-success" : "text-destructive"}`}>
        {!noArrow && (up ? <TrendingUp className="size-3 shrink-0" /> : <TrendingDown className="size-3 shrink-0" />)}
        {noArrow && <Minus className="size-3 shrink-0" />}
        <span>{hint}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG Donut
// ---------------------------------------------------------------------------
function SvgDonut({ segs, total }: { segs: { category: string; total: number; color: string; start: number; end: number }[]; total: number }) {
  const R = 70, cx = 90, cy = 90, ir = 46;
  function pt(deg: number, r: number) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  function arc(s: number, e: number) {
    const gap = 2, a = s + gap / 2, b = e - gap / 2;
    if (b - a <= 0) return "";
    const lg = b - a > 180 ? 1 : 0;
    const p1 = pt(a, R), p2 = pt(b, R), p3 = pt(b, ir), p4 = pt(a, ir);
    return `M ${p1.x} ${p1.y} A ${R} ${R} 0 ${lg} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${ir} ${ir} 0 ${lg} 0 ${p4.x} ${p4.y} Z`;
  }
  return (
    <svg width={180} height={180} viewBox="0 0 180 180">
      {segs.map((s) => <path key={s.category} d={arc(s.start, s.end)} fill={s.color} opacity={0.9} />)}
      <circle cx={cx} cy={cy} r={ir - 2} fill="hsl(var(--card))" />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={13} fontWeight="700" fill="hsl(var(--foreground))">{fmtShort(total)}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">Total</text>
    </svg>
  );
}
