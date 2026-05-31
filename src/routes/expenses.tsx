import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useState, useMemo } from "react";
import { getLocalUser, type LocalUser } from "@/lib/api-key";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { mcpCall } from "@/lib/mcp/mcp.functions";
import { toast } from "sonner";
import {
  Filter, Calendar, Plus, Search, MoreVertical,
  TrendingUp, TrendingDown, Receipt, BarChart2,
  ChevronLeft, ChevronRight, X, Check,
} from "lucide-react";

export const Route = createFileRoute("/expenses")({
  component: () => <AppShell><ExpensesPage /></AppShell>,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtINR(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

const CATEGORY_COLORS: Record<string, string> = {
  "Food & Dining": "bg-orange-500/20 text-orange-400",
  "Transportation": "bg-blue-500/20 text-blue-400",
  "Shopping": "bg-pink-500/20 text-pink-400",
  "Bills & Utilities": "bg-yellow-500/20 text-yellow-400",
  "Entertainment": "bg-purple-500/20 text-purple-400",
  "Healthcare": "bg-green-500/20 text-green-400",
  "Travel": "bg-cyan-500/20 text-cyan-400",
  "Fuel & Vehicle": "bg-amber-500/20 text-amber-400",
  "Groceries": "bg-lime-500/20 text-lime-400",
  "Rent": "bg-red-500/20 text-red-400",
  "Education": "bg-indigo-500/20 text-indigo-400",
  "Accommodation": "bg-teal-500/20 text-teal-400",
};

function catColor(cat: string) {
  return CATEGORY_COLORS[cat] ?? "bg-secondary text-muted-foreground";
}

const PAGE_SIZE = 8;

// ---------------------------------------------------------------------------
// Add Expense Modal
// ---------------------------------------------------------------------------

function AddExpenseModal({
  onClose,
  onSave,
  busy,
}: {
  onClose: () => void;
  onSave: (data: { date: string; amount: number; category: string; subcategory: string; note: string }) => void;
  busy: boolean;
}) {
  const today = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  })();
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food & Dining");
  const [subcategory, setSubcategory] = useState("");
  const [note, setNote] = useState("");

  const CATS = [
    "Food & Dining", "Groceries", "Transportation", "Fuel & Vehicle",
    "Shopping", "Entertainment", "Bills & Utilities", "Mobile & Internet",
    "Healthcare", "Travel", "Education", "Rent", "EMI & Loans",
    "Investments", "Personal Care", "Household", "Business", "Other",
  ];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount))) { toast.error("Enter a valid amount"); return; }
    onSave({ date, amount: Number(amount), category, subcategory, note });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="font-semibold text-lg">Add Expense</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-5" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Amount (₹)</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00" min="0" step="0.01"
                className="w-full h-10 px-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Subcategory (optional)</label>
            <input value={subcategory} onChange={(e) => setSubcategory(e.target.value)}
              placeholder="e.g. Restaurants"
              className="w-full h-10 px-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="What was this for?"
              className="w-full h-10 px-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-10 rounded-lg border border-border text-sm hover:bg-accent">Cancel</button>
            <button type="submit" disabled={busy}
              className="flex-1 h-10 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90">
              {busy ? "Saving…" : "Add Expense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function ExpensesPage() {
  const [localUser, setLocalUser] = useState<LocalUser | null>(null);
  const [apiKey, setApiKey] = useState("");
  const today = new Date();
  // Use local date formatting to avoid UTC timezone shift (IST = UTC+5:30)
  const toLocalISO = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const [dateStart, setDateStart] = useState(toLocalISO(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [dateEnd, setDateEnd] = useState(toLocalISO(new Date(today.getFullYear(), today.getMonth() + 1, 0)));
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showFilter, setShowFilter] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    const u = getLocalUser();
    setApiKey(u?.apiKey ?? "");
    setLocalUser(u);
  }, []);

  const callTool = useServerFn(mcpCall);

  // Personal expenses
  const personalQ = useQuery({
    enabled: !!apiKey,
    queryKey: ["expenses", dateStart, dateEnd, apiKey],
    queryFn: async () => {
      const r = await callTool({ data: { apiKey, name: "list_expenses", args: { start_date: dateStart, end_date: dateEnd } } });
      const data = r.ok ? r.data : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (Array.isArray(data) ? data : (data as any)?.expenses ?? []) as any[];
    },
  });

  // Summary for KPIs
  const summaryQ = useQuery({
    enabled: !!apiKey,
    queryKey: ["summary", dateStart, dateEnd, apiKey],
    queryFn: async () => {
      const r = await callTool({ data: { apiKey, name: "summarize", args: { start_date: dateStart, end_date: dateEnd } } });
      if (!r.ok) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const arr: any[] = Array.isArray(r.data) ? r.data : [];
      let total = 0;
      for (const row of arr) total += row.total_amount ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { total, count: arr.reduce((s: number, row2: any) => s + (row2.count ?? 0), 0) };
    },
  });

  // Groups query removed (tab removed)

  // Add expense mutation
  const addMut = useMutation({
    mutationFn: async (d: { date: string; amount: number; category: string; subcategory: string; note: string }) => {
      const r = await callTool({ data: { apiKey, name: "add_expense", args: { date: d.date, amount: d.amount, category: d.category, subcategory: d.subcategory, note: d.note } } });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    onSuccess: () => {
      toast.success("Expense added!");
      setShowAdd(false);
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allExpenses: any[] = personalQ.data ?? [];

  const filtered = useMemo(() => {
    let list = allExpenses;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        String(e.note ?? "").toLowerCase().includes(q) ||
        String(e.category ?? "").toLowerCase().includes(q) ||
        String(e.subcategory ?? "").toLowerCase().includes(q)
      );
    }
    if (filterCategory !== "all") {
      list = list.filter((e) => String(e.category ?? "") === filterCategory);
    }
    return list;
  }, [allExpenses, search, filterCategory]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalSpent = summaryQ.data?.total ?? 0;
  const txCount = summaryQ.data?.count ?? allExpenses.length;
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const avgPerDay = daysInMonth > 0 ? totalSpent / daysInMonth : 0;

  const prevMonthLabel = new Date(today.getFullYear(), today.getMonth() - 1, 1).toLocaleString("en-US", { month: "short" });

  // Derive unique categories from loaded expenses for the filter dropdown
  const availableCategories = useMemo(() => {
    const cats = new Set(allExpenses.map((e) => String(e.category ?? "Other")));
    return Array.from(cats).sort();
  }, [allExpenses]);

  // Date range label for the button
  const dateRangeLabel = (() => {
    const s = new Date(dateStart);
    const e = new Date(dateEnd);
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (s.getFullYear() === e.getFullYear()) return `${fmt(s)} – ${fmt(e)}, ${s.getFullYear()}`;
    return `${fmt(s)}, ${s.getFullYear()} – ${fmt(e)}, ${e.getFullYear()}`;
  })();

  return (
    <div className="space-y-5" onClick={() => { setShowFilter(false); setShowDatePicker(false); }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground">Track, manage and analyze all your expenses in one place.</p>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {/* Filter by category */}
          <div className="relative">
            <button
              onClick={() => { setShowFilter((v) => !v); setShowDatePicker(false); }}
              className={`h-9 px-3 rounded-lg bg-input border text-sm flex items-center gap-1.5 hover:bg-accent transition-colors ${filterCategory !== "all" ? "border-primary text-primary" : "border-border"}`}
            >
              <Filter className="size-3.5" />
              Filter
              {filterCategory !== "all" && (
                <span className="ml-1 size-4 rounded-full bg-primary text-primary-foreground text-[10px] grid place-items-center font-bold">1</span>
              )}
            </button>
            {showFilter && (
              <div className="absolute left-0 top-11 z-30 w-52 glass rounded-xl border border-border shadow-xl py-2">
                <div className="px-3 py-1.5 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Category</div>
                {["all", ...availableCategories].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => { setFilterCategory(cat); setShowFilter(false); setPage(1); }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-accent/60 transition-colors ${filterCategory === cat ? "text-primary font-medium" : ""}`}
                  >
                    {cat === "all" ? "All Categories" : cat}
                    {filterCategory === cat && <Check className="size-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date range picker */}
          <div className="relative">
            <button
              onClick={() => { setShowDatePicker((v) => !v); setShowFilter(false); }}
              className="h-9 px-3 rounded-lg bg-input border border-border text-sm flex items-center gap-1.5 hover:bg-accent transition-colors"
            >
              <Calendar className="size-3.5 text-muted-foreground" />
              <span>{dateRangeLabel}</span>
              <ChevronRight className="size-3.5 text-muted-foreground" />
            </button>
            {showDatePicker && (
              <div className="absolute right-0 top-11 z-30 glass rounded-xl border border-border shadow-xl p-4 w-72">
                <div className="text-xs font-medium mb-3">Select Date Range</div>
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">From</label>
                    <input
                      type="date"
                      value={dateStart}
                      onChange={(e) => { setDateStart(e.target.value); setPage(1); }}
                      className="w-full h-9 px-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">To</label>
                    <input
                      type="date"
                      value={dateEnd}
                      min={dateStart}
                      onChange={(e) => { setDateEnd(e.target.value); setPage(1); }}
                      className="w-full h-9 px-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => {
                        const t = new Date();
                        const toLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
                        setDateStart(toLocal(new Date(t.getFullYear(), t.getMonth(), 1)));
                        setDateEnd(toLocal(new Date(t.getFullYear(), t.getMonth() + 1, 0)));
                        setPage(1);
                      }}
                      className="flex-1 h-8 rounded-lg border border-border text-xs hover:bg-accent"
                    >
                      This Month
                    </button>
                    <button
                      onClick={() => setShowDatePicker(false)}
                      className="flex-1 h-8 rounded-lg bg-primary text-primary-foreground text-xs hover:opacity-90"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowAdd(true)}
            className="h-9 px-4 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-sm font-medium flex items-center gap-1.5 hover:opacity-90"
          >
            <Plus className="size-4" /> Add Expense
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<Receipt className="size-5 text-primary" />} bg="bg-primary/10"
          label="Total Expenses" value={summaryQ.isLoading ? "…" : fmtINR(totalSpent)}
          change={12.5} prevLabel={`vs ${prevMonthLabel}`}
        />
        <KpiCard
          icon={<BarChart2 className="size-5 text-info" />} bg="bg-info/10"
          label="This Month" value={summaryQ.isLoading ? "…" : fmtINR(totalSpent)}
          change={12.5} prevLabel={`vs ${prevMonthLabel}`}
        />
        <KpiCard
          icon={<TrendingDown className="size-5 text-success" />} bg="bg-success/10"
          label="Average per Day" value={summaryQ.isLoading ? "…" : fmtINR(avgPerDay)}
          change={8.2} prevLabel={`vs ${prevMonthLabel}`}
        />
        <KpiCard
          icon={<TrendingUp className="size-5 text-warning" />} bg="bg-warning/10"
          label="Transactions" value={summaryQ.isLoading ? "…" : String(txCount)}
          change={14} prevLabel={`vs ${prevMonthLabel}`}
        />
      </div>

      {/* Table card */}
      <div className="glass rounded-2xl overflow-hidden">
        {/* Search bar */}
        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="font-medium text-sm">All Expenses</div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search expenses…"
              className="h-8 pl-8 pr-3 rounded-lg bg-input border border-border text-xs focus:outline-none focus:ring-1 focus:ring-ring w-44"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">
                  <button className="flex items-center gap-1 hover:text-foreground">Date <span className="text-[10px]">↕</span></button>
                </th>
                <th className="px-4 py-3 font-medium">
                  <button className="flex items-center gap-1 hover:text-foreground">Description <span className="text-[10px]">↕</span></button>
                </th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Group</th>
                <th className="px-4 py-3 font-medium">
                  <button className="flex items-center gap-1 hover:text-foreground">Category <span className="text-[10px]">↕</span></button>
                </th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Paid By</th>
                <th className="px-4 py-3 font-medium text-right">
                  <button className="flex items-center gap-1 hover:text-foreground ml-auto">Amount <span className="text-[10px]">↕</span></button>
                </th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Split</th>
                <th className="px-4 py-3 font-medium text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {personalQ.isLoading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">Loading…</td></tr>
              )}
              {!personalQ.isLoading && paginated.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Receipt className="size-10 mx-auto mb-3 text-primary/30" />
                    <div className="text-sm text-muted-foreground">No expenses found.</div>
                    <button onClick={() => setShowAdd(true)} className="mt-3 h-8 px-4 rounded-lg bg-primary text-primary-foreground text-xs flex items-center gap-1.5 mx-auto hover:opacity-90">
                      <Plus className="size-3.5" /> Add your first expense
                    </button>
                  </td>
                </tr>
              )}
              {paginated.map((row, i) => (
                <ExpenseRow
                  key={row.id ?? i}
                  row={row}
                  userName={localUser?.name ?? localUser?.email?.split("@")[0] ?? "You"}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} expense{filtered.length !== 1 ? "s" : ""}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="size-8 rounded-lg border border-border grid place-items-center hover:bg-accent disabled:opacity-40"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const p = i + 1;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`size-8 rounded-lg text-xs font-medium transition-colors ${page === p ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"}`}
                  >
                    {p}
                  </button>
                );
              })}
              {totalPages > 5 && <span className="text-muted-foreground text-xs px-1">…</span>}
              {totalPages > 5 && (
                <button
                  onClick={() => setPage(totalPages)}
                  className={`size-8 rounded-lg text-xs font-medium border border-border hover:bg-accent ${page === totalPages ? "bg-primary text-primary-foreground" : ""}`}
                >
                  {totalPages}
                </button>
              )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="size-8 rounded-lg border border-border grid place-items-center hover:bg-accent disabled:opacity-40"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add expense modal */}
      {showAdd && (
        <AddExpenseModal
          onClose={() => setShowAdd(false)}
          onSave={(d) => addMut.mutate(d)}
          busy={addMut.isPending}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expense row
// ---------------------------------------------------------------------------

function ExpenseRow({ row, userName }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any;
  userName: string;
}) {
  const [open, setOpen] = useState(false);
  const dateStr = row.expense_date ?? row.date ?? "";
  const createdAt = row.created_at;
  const cat = String(row.category ?? "Other");
  const sub = row.subcategory ? ` · ${row.subcategory}` : "";
  const note = row.note || cat;
  const amt = Number(row.amount ?? 0);
  const isGroup = !!row.group_id;

  return (
    <tr className="border-t border-border hover:bg-accent/20 transition-colors">
      {/* Date */}
      <td className="px-4 py-3">
        <div className="text-sm font-medium">{fmtDate(dateStr)}</div>
        {createdAt && <div className="text-[11px] text-muted-foreground">{fmtTime(createdAt)}</div>}
      </td>

      {/* Description */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className={`size-8 rounded-lg grid place-items-center text-sm shrink-0 ${catColor(cat)}`}>
            {cat.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate max-w-[160px]">{note}</div>
            {isGroup && <div className="text-[11px] text-muted-foreground">Group expense</div>}
          </div>
        </div>
      </td>

      {/* Group */}
      <td className="px-4 py-3 hidden lg:table-cell">
        {isGroup ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-4 rounded bg-secondary grid place-items-center text-[10px]">G</span>
            Group
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Personal</span>
        )}
      </td>

      {/* Category */}
      <td className="px-4 py-3">
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${catColor(cat)}`}>
          {cat}{sub}
        </span>
      </td>

      {/* Paid By */}
      <td className="px-4 py-3 hidden md:table-cell">
        <div className="flex items-center gap-1.5">
          <div className="size-6 rounded-full bg-primary/20 grid place-items-center text-primary text-[10px] font-bold">
            {userName.slice(0, 1).toUpperCase()}
          </div>
          <span className="text-sm">{userName}</span>
        </div>
      </td>

      {/* Amount */}
      <td className="px-4 py-3 text-right">
        <span className="text-sm font-semibold">{fmtINR(amt)}</span>
      </td>

      {/* Split */}
      <td className="px-4 py-3 hidden lg:table-cell">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>👥</span>
          <span>1</span>
        </div>
      </td>

      {/* Actions */}
      <td className="px-4 py-3 text-center">
        <div className="relative inline-block">
          <button
            onClick={() => setOpen((o) => !o)}
            className="size-7 rounded-lg hover:bg-accent grid place-items-center text-muted-foreground hover:text-foreground"
          >
            <MoreVertical className="size-4" />
          </button>
          {open && (
            <div className="absolute right-0 top-8 z-20 w-36 glass rounded-xl border border-border shadow-xl py-1">
              <button className="w-full text-left px-3 py-2 text-xs hover:bg-accent flex items-center gap-2">
                <Check className="size-3.5 text-success" /> Edit
              </button>
              <button className="w-full text-left px-3 py-2 text-xs hover:bg-accent flex items-center gap-2 text-destructive">
                <X className="size-3.5" /> Delete
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

function KpiCard({ icon, bg, label, value, change, prevLabel }: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  value: string;
  change: number;
  prevLabel: string;
}) {
  const up = change >= 0;
  return (
    <div className="glass rounded-2xl p-4 flex items-center gap-4">
      <div className={`size-12 rounded-xl grid place-items-center shrink-0 ${bg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold tracking-tight">{value}</div>
        <div className={`flex items-center gap-1 text-[11px] ${up ? "text-success" : "text-destructive"}`}>
          {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          <span>{Math.abs(change).toFixed(1)}% {prevLabel}</span>
        </div>
      </div>
    </div>
  );
}
