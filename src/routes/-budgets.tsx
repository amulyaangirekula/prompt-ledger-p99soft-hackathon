// import { createFileRoute } from "@tanstack/react-router";
// import { AppShell } from "@/components/layout/AppShell";
// import { useState, useMemo } from "react";
// import {
//   Plus, Search, Filter, MoreVertical, Calendar,
//   TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
//   PiggyBank, X, Check, ChevronRight,
// } from "lucide-react";
// import { toast } from "sonner";
// import {
//   BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
// } from "recharts";

// export const Route = createFileRoute("/budgets")({
//   component: () => <AppShell><BudgetsPage /></AppShell>,
// });

// // ---------------------------------------------------------------------------
// // Types
// // ---------------------------------------------------------------------------

// interface Budget {
//   id: string;
//   name: string;
//   type: "group" | "category" | "personal";
//   group?: string;
//   amount: number;
//   spent: number;
//   color: string;
//   emoji: string;
// }

// // ---------------------------------------------------------------------------
// // Helpers
// // ---------------------------------------------------------------------------

// function fmtINR(n: number) {
//   return "₹" + Math.round(n).toLocaleString("en-IN");
// }

// function pct(spent: number, amount: number) {
//   if (!amount) return 0;
//   return Math.round((spent / amount) * 1000) / 10;
// }

// function statusLabel(p: number) {
//   if (p > 100) return { label: "Over Budget", cls: "text-destructive bg-destructive/10" };
//   if (p >= 85) return { label: "At Risk", cls: "text-warning bg-warning/10" };
//   return { label: "On Track", cls: "text-success bg-success/10" };
// }

// const COLORS = [
//   "#a78bfa", "#60a5fa", "#34d399", "#fbbf24",
//   "#f472b6", "#94a3b8", "#fb923c", "#818cf8",
// ];

// const EMOJIS: Record<string, string> = {
//   group: "✈️", category: "🍽️", personal: "👤",
// };

// const CATEGORY_EMOJIS: Record<string, string> = {
//   "Food": "🍽️", "Transportation": "🚗", "Accommodation": "🏨",
//   "Entertainment": "🎬", "Shopping": "🛍️", "Miscellaneous": "📦",
//   "Monthly Food Budget": "🥗",
// };

// // ---------------------------------------------------------------------------
// // Default budgets (local state — no backend budget tool exists)
// // ---------------------------------------------------------------------------

// const DEFAULT_BUDGETS: Budget[] = [
//   { id: "1", name: "Goa Trip 2024", type: "group", group: "Goa Trip 2024", amount: 40000, spent: 32450, color: COLORS[0], emoji: "✈️" },
//   { id: "2", name: "Monthly Food Budget", type: "category", amount: 15000, spent: 11240, color: COLORS[1], emoji: "🥗" },
//   { id: "3", name: "Transportation", type: "category", amount: 10000, spent: 8920, color: COLORS[2], emoji: "🚗" },
//   { id: "4", name: "Accommodation", type: "category", group: "Goa Trip 2024", amount: 12000, spent: 12800, color: COLORS[3], emoji: "🏨" },
//   { id: "5", name: "Entertainment", type: "category", amount: 8000, spent: 6850, color: COLORS[4], emoji: "🎬" },
//   { id: "6", name: "Shopping", type: "category", amount: 6000, spent: 4200, color: COLORS[5], emoji: "🛍️" },
//   { id: "7", name: "Miscellaneous", type: "category", amount: 5000, spent: 2860, color: COLORS[6], emoji: "📦" },
// ];

// // ---------------------------------------------------------------------------
// // Main page
// // ---------------------------------------------------------------------------

// function BudgetsPage() {
//   const [budgets, setBudgets] = useState<Budget[]>(DEFAULT_BUDGETS);
//   const [tab, setTab] = useState<"all" | "group" | "category">("all");
//   const [search, setSearch] = useState("");
//   const [showCreate, setShowCreate] = useState(false);

//   // New budget form state
//   const [newName, setNewName] = useState("");
//   const [newType, setNewType] = useState<"group" | "category" | "personal">("category");
//   const [newAmount, setNewAmount] = useState("");

//   const filtered = useMemo(() => {
//     let list = budgets;
//     if (tab !== "all") list = list.filter((b) => b.type === tab);
//     if (search.trim()) list = list.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()));
//     return list;
//   }, [budgets, tab, search]);

//   const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
//   const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
//   const totalRemaining = totalBudget - totalSpent;
//   const overBudgetCount = budgets.filter((b) => b.spent > b.amount).length;
//   const overBudgetAmount = budgets.filter((b) => b.spent > b.amount).reduce((s, b) => s + (b.spent - b.amount), 0);

//   // Donut chart data
//   const donutData = budgets.map((b, i) => ({
//     name: b.name,
//     value: b.amount,
//     color: COLORS[i % COLORS.length],
//     pct: Math.round((b.amount / totalBudget) * 1000) / 10,
//   }));

//   // Bar chart data
//   const barData = budgets.map((b) => ({
//     name: b.name.length > 12 ? b.name.slice(0, 12) + "…" : b.name,
//     "Budget Amount": b.amount,
//     "Actual Spent": b.spent,
//   }));

//   // Alerts
//   const alerts = budgets
//     .filter((b) => pct(b.spent, b.amount) >= 80)
//     .sort((a, b) => pct(b.spent, b.amount) - pct(a.spent, a.amount))
//     .slice(0, 4);

//   const createBudget = () => {
//     if (!newName.trim() || !newAmount || isNaN(Number(newAmount))) {
//       toast.error("Enter a valid name and amount");
//       return;
//     }
//     const nb: Budget = {
//       id: Date.now().toString(),
//       name: newName.trim(),
//       type: newType,
//       amount: Number(newAmount),
//       spent: 0,
//       color: COLORS[budgets.length % COLORS.length],
//       emoji: EMOJIS[newType] ?? "💰",
//     };
//     setBudgets((p) => [...p, nb]);
//     toast.success("Budget created!");
//     setNewName(""); setNewAmount(""); setNewType("category"); setShowCreate(false);
//   };

//   return (
//     <div className="space-y-5">
//       {/* Header */}
//       <div className="flex items-center justify-between gap-3 flex-wrap">
//         <div>
//           <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
//           <p className="text-sm text-muted-foreground">Plan better. Spend smarter.</p>
//         </div>
//         <div className="flex items-center gap-2">
//           <div className="h-9 px-3 rounded-lg bg-input border border-border text-sm flex items-center gap-1.5">
//             <Calendar className="size-3.5 text-muted-foreground" />
//             <span className="text-sm">Apr 1 – Apr 30, 2024</span>
//             <ChevronRight className="size-3.5 text-muted-foreground" />
//           </div>
//           <button
//             onClick={() => setShowCreate(true)}
//             className="h-9 px-4 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-sm font-medium flex items-center gap-1.5 hover:opacity-90"
//           >
//             <Plus className="size-4" /> New Budget
//           </button>
//         </div>
//       </div>

//       {/* KPI cards */}
//       <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
//         <KpiCard icon="💰" bg="bg-primary/10" label="Total Budget" value={fmtINR(totalBudget)} sub="Across all budgets" />
//         <KpiCard icon="📊" bg="bg-info/10" label="Total Spent" value={fmtINR(totalSpent)} sub={`${pct(totalSpent, totalBudget)}% of total budget`} />
//         <KpiCard icon="⏰" bg="bg-success/10" label="Total Remaining" value={fmtINR(totalRemaining)} sub={`${pct(totalRemaining, totalBudget)}% of total budget`} />
//         <KpiCard icon="⚠️" bg="bg-destructive/10" label="Over Budget" value={fmtINR(overBudgetAmount)} sub={`${overBudgetCount} budget${overBudgetCount !== 1 ? "s" : ""} exceeded`} />
//       </div>

//       {/* Main grid */}
//       <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
//         {/* Left: budget table */}
//         <div className="lg:col-span-2 glass rounded-2xl overflow-hidden flex flex-col">
//           {/* Tabs + search */}
//           <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
//             <div className="flex items-center gap-1">
//               {(["all", "group", "category"] as const).map((t) => (
//                 <button
//                   key={t}
//                   onClick={() => setTab(t)}
//                   className={`h-8 px-3 rounded-lg text-sm transition-colors ${tab === t ? "bg-primary/20 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/40"}`}
//                 >
//                   {t === "all" ? "All Budgets" : t === "group" ? "Group Budgets" : "Category Budgets"}
//                 </button>
//               ))}
//             </div>
//             <div className="flex items-center gap-2">
//               <div className="relative">
//                 <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
//                 <input
//                   value={search}
//                   onChange={(e) => setSearch(e.target.value)}
//                   placeholder="Search budgets…"
//                   className="h-8 pl-8 pr-3 rounded-lg bg-input border border-border text-xs focus:outline-none focus:ring-1 focus:ring-ring w-40"
//                 />
//               </div>
//               <button className="h-8 px-2.5 rounded-lg bg-input border border-border text-xs flex items-center gap-1 hover:bg-accent">
//                 <Filter className="size-3" /> Filters
//               </button>
//             </div>
//           </div>

//           {/* Table */}
//           <div className="overflow-x-auto">
//             <table className="w-full text-sm">
//               <thead>
//                 <tr className="border-b border-border text-left text-xs text-muted-foreground">
//                   <th className="px-4 py-3 font-medium">Budget</th>
//                   <th className="px-4 py-3 font-medium">Type</th>
//                   <th className="px-4 py-3 font-medium text-right">Budget Amount</th>
//                   <th className="px-4 py-3 font-medium text-right">Spent</th>
//                   <th className="px-4 py-3 font-medium">Progress</th>
//                   <th className="px-4 py-3 font-medium">Status</th>
//                   <th className="px-4 py-3 font-medium text-center">Actions</th>
//                 </tr>
//               </thead>
//               <tbody>
//                 {filtered.length === 0 && (
//                   <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground text-sm">No budgets found.</td></tr>
//                 )}
//                 {filtered.map((b) => {
//                   const p = pct(b.spent, b.amount);
//                   const st = statusLabel(p);
//                   return (
//                     <tr key={b.id} className="border-t border-border hover:bg-accent/20 transition-colors">
//                       <td className="px-4 py-3">
//                         <div className="flex items-center gap-2.5">
//                           <div className="size-9 rounded-xl grid place-items-center text-lg shrink-0" style={{ background: b.color + "22" }}>
//                             {b.emoji}
//                           </div>
//                           <div>
//                             <div className="font-medium text-sm">{b.name}</div>
//                             {b.group && <div className="text-[11px] text-muted-foreground">{b.group}</div>}
//                             {!b.group && <div className="text-[11px] text-muted-foreground">Personal</div>}
//                           </div>
//                         </div>
//                       </td>
//                       <td className="px-4 py-3">
//                         <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${b.type === "group" ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"}`}>
//                           {b.type === "group" ? "Group" : "Category"}
//                         </span>
//                       </td>
//                       <td className="px-4 py-3 text-right font-medium">{fmtINR(b.amount)}</td>
//                       <td className="px-4 py-3 text-right">{fmtINR(b.spent)}</td>
//                       <td className="px-4 py-3 w-36">
//                         <div className="flex items-center gap-2">
//                           <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
//                             <div
//                               className="h-full rounded-full transition-all"
//                               style={{
//                                 width: `${Math.min(p, 100)}%`,
//                                 background: p > 100 ? "hsl(var(--destructive))" : p >= 85 ? "hsl(var(--warning))" : b.color,
//                               }}
//                             />
//                           </div>
//                           <span className="text-[11px] text-muted-foreground w-10 text-right">{p}%</span>
//                         </div>
//                       </td>
//                       <td className="px-4 py-3">
//                         <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${st.cls}`}>
//                           {st.label}
//                         </span>
//                       </td>
//                       <td className="px-4 py-3 text-center">
//                         <button className="size-7 rounded-lg hover:bg-accent grid place-items-center text-muted-foreground hover:text-foreground">
//                           <MoreVertical className="size-4" />
//                         </button>
//                       </td>
//                     </tr>
//                   );
//                 })}
//               </tbody>
//             </table>
//           </div>

//           {/* Footer */}
//           <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground">
//             Showing 1 to {filtered.length} of {filtered.length} budget{filtered.length !== 1 ? "s" : ""}
//           </div>
//         </div>

//         {/* Right sidebar */}
//         <div className="flex flex-col gap-4">
//           {/* Budget Overview donut */}
//           <div className="glass rounded-2xl p-5">
//             <div className="font-semibold text-sm mb-4">Budget Overview</div>
//             <div className="flex items-center gap-4">
//               <DonutChart data={donutData} total={totalBudget} />
//               <div className="flex-1 min-w-0 space-y-1.5">
//                 {donutData.slice(0, 7).map((d) => (
//                   <div key={d.name} className="flex items-center gap-1.5 text-xs">
//                     <span className="size-2 rounded-full shrink-0" style={{ background: d.color }} />
//                     <span className="flex-1 truncate text-muted-foreground">{d.name.length > 14 ? d.name.slice(0, 14) + "…" : d.name}</span>
//                     <span className="font-medium">{d.pct}%</span>
//                   </div>
//                 ))}
//               </div>
//             </div>
//             <button className="mt-3 w-full h-8 rounded-lg border border-border text-xs flex items-center justify-center gap-1.5 hover:bg-accent text-muted-foreground hover:text-foreground">
//               View full report <ChevronRight className="size-3" />
//             </button>
//           </div>

//           {/* Budget Alerts */}
//           <div className="glass rounded-2xl p-5">
//             <div className="flex items-center justify-between mb-3">
//               <div className="font-semibold text-sm">Budget Alerts</div>
//               <button className="text-xs text-primary hover:underline">View all</button>
//             </div>
//             <div className="space-y-2">
//               {alerts.map((b) => {
//                 const p = pct(b.spent, b.amount);
//                 const isOver = p > 100;
//                 return (
//                   <button key={b.id} className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-accent/40 transition-colors text-left group">
//                     <div className={`size-8 rounded-lg grid place-items-center shrink-0 ${isOver ? "bg-destructive/15" : "bg-warning/15"}`}>
//                       {isOver
//                         ? <AlertTriangle className="size-3.5 text-destructive" />
//                         : <TrendingUp className="size-3.5 text-warning" />}
//                     </div>
//                     <div className="flex-1 min-w-0">
//                       <div className="text-xs font-medium truncate">{b.name}</div>
//                       <div className="text-[11px] text-muted-foreground">
//                         {isOver
//                           ? `Exceeded by ${fmtINR(b.spent - b.amount)}`
//                           : `${p}% of budget used`}
//                       </div>
//                     </div>
//                     <ChevronRight className="size-3.5 text-muted-foreground group-hover:text-foreground" />
//                   </button>
//                 );
//               })}
//               {/* On-track budgets */}
//               {budgets.filter((b) => pct(b.spent, b.amount) < 80).slice(0, 2).map((b) => (
//                 <button key={b.id + "-ok"} className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-accent/40 transition-colors text-left group">
//                   <div className="size-8 rounded-lg grid place-items-center shrink-0 bg-success/15">
//                     <CheckCircle2 className="size-3.5 text-success" />
//                   </div>
//                   <div className="flex-1 min-w-0">
//                     <div className="text-xs font-medium truncate">{b.name}</div>
//                     <div className="text-[11px] text-muted-foreground">
//                       On track, {Math.round(100 - pct(b.spent, b.amount))}% remaining
//                     </div>
//                   </div>
//                   <ChevronRight className="size-3.5 text-muted-foreground group-hover:text-foreground" />
//                 </button>
//               ))}
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* Budget vs Actual bar chart */}
//       <div className="glass rounded-2xl p-5">
//         <div className="flex items-center justify-between mb-4">
//           <div className="font-semibold">Budget vs Actual</div>
//           <div className="flex items-center gap-4 text-xs text-muted-foreground">
//             <div className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary inline-block" /> Budget Amount</div>
//             <div className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary/30 border border-primary/50 inline-block" /> Actual Spent</div>
//             <button className="h-7 px-2.5 rounded-lg bg-input border border-border hover:bg-accent flex items-center gap-1">
//               This Month <ChevronRight className="size-3" />
//             </button>
//           </div>
//         </div>
//         <ResponsiveContainer width="100%" height={200}>
//           <BarChart data={barData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }} barGap={4}>
//             <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
//             <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
//             <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
//             <Tooltip
//               contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
//               formatter={(v: number) => [fmtINR(v)]}
//             />
//             <Bar dataKey="Budget Amount" fill="#a78bfa" radius={[4, 4, 0, 0]} maxBarSize={32} />
//             <Bar dataKey="Actual Spent" fill="#a78bfa44" stroke="#a78bfa" strokeWidth={1} strokeDasharray="4 2" radius={[4, 4, 0, 0]} maxBarSize={32} />
//           </BarChart>
//         </ResponsiveContainer>
//       </div>

//       {/* Create Budget Modal */}
//       {showCreate && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
//           <div className="glass rounded-2xl p-6 w-full max-w-md shadow-2xl">
//             <div className="flex items-center justify-between mb-5">
//               <div className="font-semibold text-lg">Create New Budget</div>
//               <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
//                 <X className="size-5" />
//               </button>
//             </div>
//             <div className="space-y-4">
//               <div>
//                 <label className="text-xs text-muted-foreground block mb-1">Budget name</label>
//                 <input
//                   value={newName}
//                   onChange={(e) => setNewName(e.target.value)}
//                   placeholder="e.g. Monthly Food Budget"
//                   autoFocus
//                   className="w-full h-10 px-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//                 />
//               </div>
//               <div>
//                 <label className="text-xs text-muted-foreground block mb-1">Type</label>
//                 <div className="grid grid-cols-3 gap-2">
//                   {(["category", "group", "personal"] as const).map((t) => (
//                     <button
//                       key={t}
//                       type="button"
//                       onClick={() => setNewType(t)}
//                       className={`h-10 rounded-xl border text-xs flex items-center justify-center gap-1.5 transition-colors ${newType === t ? "border-primary bg-primary/15 text-primary" : "border-border bg-input hover:bg-accent"}`}
//                     >
//                       <span>{EMOJIS[t]}</span>
//                       <span className="capitalize font-medium">{t}</span>
//                       {newType === t && <Check className="size-3" />}
//                     </button>
//                   ))}
//                 </div>
//               </div>
//               <div>
//                 <label className="text-xs text-muted-foreground block mb-1">Budget Amount (₹)</label>
//                 <input
//                   type="number"
//                   value={newAmount}
//                   onChange={(e) => setNewAmount(e.target.value)}
//                   placeholder="0"
//                   min="0"
//                   className="w-full h-10 px-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
//                 />
//               </div>
//               <div className="flex gap-2 pt-1">
//                 <button onClick={() => setShowCreate(false)} className="flex-1 h-10 rounded-lg border border-border text-sm hover:bg-accent">Cancel</button>
//                 <button
//                   onClick={createBudget}
//                   className="flex-1 h-10 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-sm font-medium hover:opacity-90"
//                 >
//                   Create Budget
//                 </button>
//               </div>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// // ---------------------------------------------------------------------------
// // Sub-components
// // ---------------------------------------------------------------------------

// function KpiCard({ icon, bg, label, value, sub }: {
//   icon: string; bg: string; label: string; value: string; sub: string;
// }) {
//   return (
//     <div className="glass rounded-2xl p-4 flex items-center gap-4">
//       <div className={`size-12 rounded-xl grid place-items-center text-2xl shrink-0 ${bg}`}>{icon}</div>
//       <div className="min-w-0">
//         <div className="text-xs text-muted-foreground">{label}</div>
//         <div className="text-xl font-bold tracking-tight">{value}</div>
//         <div className="text-[11px] text-muted-foreground">{sub}</div>
//       </div>
//     </div>
//   );
// }

// function DonutChart({ data, total }: { data: Array<{ name: string; value: number; color: string; pct: number }>; total: number }) {
//   const sum = data.reduce((s, d) => s + d.value, 0) || 1;
//   let acc = 0;
//   const stops = data.map((d) => {
//     const start = (acc / sum) * 100;
//     acc += d.value;
//     const end = (acc / sum) * 100;
//     return `${d.color} ${start}% ${end}%`;
//   }).join(", ");

//   return (
//     <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
//       <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${stops})` }} />
//       <div className="absolute inset-3 rounded-full bg-card grid place-items-center">
//         <div className="text-center">
//           <div className="text-sm font-bold">{"₹" + Math.round(total / 1000) + "k"}</div>
//           <div className="text-[9px] text-muted-foreground">Total Budget</div>
//         </div>
//       </div>
//     </div>
//   );
// }
