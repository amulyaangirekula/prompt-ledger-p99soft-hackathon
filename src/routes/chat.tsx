import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { getLocalUser } from "@/lib/api-key";
import {
  Sparkles, MessageSquarePlus, Brain,
  Receipt, Upload, Split, PiggyBank,
  TrendingUp, PieChart, AlertTriangle,
  MessageCircle, ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/chat")({ component: ChatPage });

// ---------------------------------------------------------------------------
// Quick actions
// ---------------------------------------------------------------------------
const QUICK_ACTIONS = [
  { icon: Receipt, label: "Add Expense", sub: "Add a new expense quickly", color: "bg-blue-500/20 text-blue-400" },
  { icon: Upload, label: "Upload Receipt", sub: "Scan and add receipt", color: "bg-purple-500/20 text-purple-400" },
  { icon: Split, label: "Split Expense", sub: "Split with group members", color: "bg-green-500/20 text-green-400" },
  { icon: PiggyBank, label: "Set Budget", sub: "Create or update budget", color: "bg-orange-500/20 text-orange-400" },
];

// Recent conversations (static for now)
const RECENT = [
  { label: "April expense summary", time: "10:28 AM" },
  { label: "Goa Trip settlements", time: "Yesterday" },
  { label: "Budget vs Actual", time: "May 25" },
  { label: "Top spenders in group", time: "May 24" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ChatPage() {
  const [apiKey, setApiKey] = useState("");
  const [userName, setUserName] = useState("there");

  useEffect(() => {
    const u = getLocalUser();
    setApiKey(u?.apiKey ?? "");
    setUserName(u?.name ?? u?.email?.split("@")[0] ?? "there");
  }, []);

  return (
    <AppShell>
      <div className="flex flex-col h-full" style={{ height: "calc(100vh - 112px)" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">AI Workspace</h1>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-semibold uppercase">Beta</span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">Your AI financial assistant. Ask anything about your expenses.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="h-9 px-3 rounded-lg bg-input border border-border text-sm flex items-center gap-1.5 hover:bg-accent">
              <Brain className="size-3.5 text-muted-foreground" /> Workspace Memory
            </button>
            <button className="h-9 px-4 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-sm font-medium flex items-center gap-1.5 hover:opacity-90">
              <MessageSquarePlus className="size-4" /> New Chat
            </button>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="flex gap-5 flex-1 min-h-0">
          {/* Left: Chat */}
          <div className="flex-1 min-w-0 min-h-0 glass rounded-2xl overflow-hidden flex flex-col">
            <ChatPanel apiKey={apiKey} userName={userName} />
          </div>

          {/* Right: sidebar */}
          <div className="w-72 shrink-0 flex flex-col gap-4 overflow-y-auto">
            {/* Quick Actions */}
            <div className="glass rounded-2xl p-4">
              <div className="font-semibold text-sm mb-3">Quick Actions</div>
              <div className="space-y-2">
                {QUICK_ACTIONS.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.label}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent/40 transition-colors group text-left"
                    >
                      <div className={`size-9 rounded-lg grid place-items-center shrink-0 ${a.color}`}>
                        <Icon className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{a.label}</div>
                        <div className="text-[11px] text-muted-foreground">{a.sub}</div>
                      </div>
                      <ChevronRight className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* AI Insights */}
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-sm">AI Insights</div>
                <button className="text-xs text-primary hover:underline">View all</button>
              </div>
              <div className="space-y-3">
                <InsightCard
                  icon={TrendingUp}
                  color="text-success bg-success/10"
                  title="Spending Trend"
                  desc="You spent 12.5% more this month compared to last month."
                />
                <InsightCard
                  icon={PieChart}
                  color="text-primary bg-primary/10"
                  title="Top Category"
                  desc="Food & Dining is your top spending category this month."
                />
                <InsightCard
                  icon={AlertTriangle}
                  color="text-warning bg-warning/10"
                  title="Budget Alert"
                  desc="You are 80% close to your Food budget limit."
                />
              </div>
            </div>

            {/* Recent Conversations */}
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-sm">Recent Conversations</div>
                <button className="text-xs text-primary hover:underline">View all</button>
              </div>
              <div className="space-y-1">
                {RECENT.map((c, i) => (
                  <button
                    key={i}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-accent/40 transition-colors text-left"
                  >
                    <MessageCircle className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-xs truncate">{c.label}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{c.time}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function InsightCard({ icon: Icon, color, title, desc }: {
  icon: React.ElementType;
  color: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className={`size-8 rounded-lg grid place-items-center shrink-0 ${color}`}>
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-semibold">{title}</div>
        <div className="text-[11px] text-muted-foreground leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}
