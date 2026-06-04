import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ChatPanel, type ChatPanelHandle } from "@/components/chat/ChatPanel";
import { getLocalUser } from "@/lib/api-key";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listUserThreads, createNewThread, deleteThreadById, getThreadById } from "@/lib/db/thread-functions.server";
import {
  Sparkles, MessageSquarePlus, Brain,
  Receipt, Split, PiggyBank,
  TrendingUp, PieChart, AlertTriangle,
  MessageCircle, ChevronRight, Trash2, Loader2,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/chat")({ component: ChatPage });

// ---------------------------------------------------------------------------
// Quick Actions — each has a prompt that gets injected into the chat input
// ---------------------------------------------------------------------------
const QUICK_ACTIONS = [
  { icon: Receipt,  label: "Add Expense",   sub: "Add a new expense quickly",    prompt: "Add an expense for today" },
  { icon: Split,    label: "Split Expense", sub: "Split with group members",      prompt: "Split an expense with my group" },
  { icon: PiggyBank,label: "Set Budget",    sub: "Create or update a budget",     prompt: "Create a new monthly budget" },
  { icon: TrendingUp, label: "Monthly Report", sub: "Full spending breakdown",    prompt: "Generate my monthly expense report" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeLabel(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ChatPage() {
  const [apiKey, setApiKey] = useState("");
  const [userName, setUserName] = useState("there");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const chatRef = useRef<ChatPanelHandle>(null);
  const qc = useQueryClient();

  const listThreadsFn = useServerFn(listUserThreads);
  const createThreadFn = useServerFn(createNewThread);
  const deleteThreadFn = useServerFn(deleteThreadById);
  const getThreadFn = useServerFn(getThreadById);

  useEffect(() => {
    const u = getLocalUser();
    setApiKey(u?.apiKey ?? "");
    setUserName(u?.name ?? u?.email?.split("@")[0] ?? "there");
  }, []);

  // ---- Thread list --------------------------------------------------------
  const threadsQ = useQuery({
    enabled: !!apiKey,
    queryKey: ["threads", apiKey],
    queryFn: () => listThreadsFn({ data: { apiKey } }),
    staleTime: 30_000,
  });

  // ---- Create new thread --------------------------------------------------
  const createMut = useMutation({
    mutationFn: async () => {
      const res = await createThreadFn({ data: { apiKey } });
      return res.threadId;
    },
    onSuccess: (threadId) => {
      setActiveThreadId(threadId);
      chatRef.current?.resetThread(threadId);
      qc.invalidateQueries({ queryKey: ["threads"] });
    },
    onError: () => toast.error("Failed to create new conversation"),
  });

  // ---- Delete thread -------------------------------------------------------
  const deleteMut = useMutation({
    mutationFn: async (threadId: string) => {
      await deleteThreadFn({ data: { apiKey, threadId } });
    },
    onSuccess: (_, threadId) => {
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
        chatRef.current?.resetThread(null);
      }
      qc.invalidateQueries({ queryKey: ["threads"] });
    },
    onError: () => toast.error("Failed to delete conversation"),
  });

  // ---- Initialize first thread on load ------------------------------------
  useEffect(() => {
    if (!apiKey || activeThreadId) return;
    if (threadsQ.data && threadsQ.data.length > 0) {
      // Resume most recent thread — load its messages
      const latest = threadsQ.data[0];
      handleSelectThread(latest.threadId);
    } else if (threadsQ.isFetched) {
      // No threads yet — create one
      createMut.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, threadsQ.isFetched]);

  const handleSelectThread = useCallback(async (threadId: string) => {
    setActiveThreadId(threadId);
    // Clear panel first so it shows loading state
    chatRef.current?.resetThread(threadId);

    // Load saved messages from MongoDB and restore them in the panel
    try {
      const thread = await getThreadFn({ data: { apiKey, threadId } });
      if (thread?.messages && thread.messages.length > 0) {
        chatRef.current?.loadMessages(thread.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })));
      }
    } catch {
      // Non-fatal — panel stays empty, user can still chat
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  const handleNewChat = () => {
    createMut.mutate();
  };

  const handleQuickAction = (prompt: string) => {
    chatRef.current?.setInputText(prompt);
  };

  // ---- AI Insights (live data) -------------------------------------------
  // These will be real once the summarize tool is wired — for now keep as
  // placeholders but structured for easy replacement.
  const INSIGHTS = [
    { icon: TrendingUp, color: "text-success bg-success/10", title: "Spending Trend",   desc: "Ask the AI: 'How does my spending compare to last month?'" },
    { icon: PieChart,   color: "text-primary bg-primary/10", title: "Top Category",     desc: "Ask: 'Which category did I spend most on this month?'" },
    { icon: AlertTriangle, color: "text-warning bg-warning/10", title: "Group Balances", desc: "Ask: 'Who owes what in my groups?'" },
  ];

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
            <p className="text-sm text-muted-foreground mt-0.5">
              Your AI financial assistant. Ask anything about your expenses.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="h-9 px-3 rounded-lg bg-input border border-border text-sm flex items-center gap-1.5 hover:bg-accent transition-colors">
              <Brain className="size-3.5 text-muted-foreground" /> Memory
              <span className="text-[10px] px-1 py-0.5 rounded bg-primary/20 text-primary font-semibold">
                {MEMORY_TURNS} turns
              </span>
            </button>
            <button
              onClick={handleNewChat}
              disabled={createMut.isPending}
              className="h-9 px-4 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-sm font-medium flex items-center gap-1.5 hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {createMut.isPending
                ? <Loader2 className="size-4 animate-spin" />
                : <MessageSquarePlus className="size-4" />}
              New Chat
            </button>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="flex gap-5 flex-1 min-h-0">
          {/* Left: Chat */}
          <div className="flex-1 min-w-0 min-h-0 glass rounded-2xl overflow-hidden flex flex-col">
            <ChatPanel
              ref={chatRef}
              apiKey={apiKey}
              userName={userName}
              threadId={activeThreadId}
            />
          </div>

          {/* Right: sidebar */}
          <div className="w-72 shrink-0 flex flex-col gap-4 overflow-y-auto">

            {/* Quick Actions */}
            <div className="glass rounded-2xl p-4">
              <div className="font-semibold text-sm mb-3">Quick Actions</div>
              <div className="space-y-1.5">
                {QUICK_ACTIONS.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.label}
                      onClick={() => handleQuickAction(a.prompt)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent/40 transition-colors group text-left"
                    >
                      <div className="size-8 rounded-lg grid place-items-center shrink-0 bg-primary/15">
                        <Icon className="size-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{a.label}</div>
                        <div className="text-[11px] text-muted-foreground">{a.sub}</div>
                      </div>
                      <ChevronRight className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* AI Insights */}
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-sm">AI Insights</div>
                <button
                  onClick={() => handleQuickAction("Give me a summary of my finances this month")}
                  className="text-xs text-primary hover:underline"
                >
                  Ask AI
                </button>
              </div>
              <div className="space-y-3">
                {INSIGHTS.map((ins) => {
                  const Icon = ins.icon;
                  return (
                    <button
                      key={ins.title}
                      onClick={() => handleQuickAction(ins.desc.replace(/^Ask.*?'|'$/g, "").trim())}
                      className="w-full flex items-start gap-2.5 text-left hover:opacity-80 transition-opacity"
                    >
                      <div className={`size-8 rounded-lg grid place-items-center shrink-0 ${ins.color}`}>
                        <Icon className="size-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold">{ins.title}</div>
                        <div className="text-[11px] text-muted-foreground leading-relaxed">{ins.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recent Conversations — live from MongoDB */}
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-sm">Recent Conversations</div>
                {threadsQ.isLoading && <Loader2 className="size-3.5 text-muted-foreground animate-spin" />}
              </div>

              {threadsQ.data?.length === 0 && (
                <p className="text-[11px] text-muted-foreground px-1">
                  No conversations yet. Start chatting!
                </p>
              )}

              <div className="space-y-0.5">
                {(threadsQ.data ?? []).map((t) => (
                  <div
                    key={t.threadId}
                    className={`group flex items-center gap-2 px-2 py-2 rounded-lg transition-colors cursor-pointer ${
                      activeThreadId === t.threadId ? "bg-primary/15" : "hover:bg-accent/40"
                    }`}
                    onClick={() => handleSelectThread(t.threadId)}
                  >
                    <MessageCircle className={`size-3.5 shrink-0 ${activeThreadId === t.threadId ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="flex-1 text-xs truncate">{t.title}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0 group-hover:hidden">
                      {timeLabel(t.updatedAt)}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteMut.mutate(t.threadId); }}
                      className="hidden group-hover:grid size-5 rounded place-items-center text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      title="Delete conversation"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </AppShell>
  );
}

// Export MEMORY_TURNS so the UI badge shows the correct number
const MEMORY_TURNS = 5;
