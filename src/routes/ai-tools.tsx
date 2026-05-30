import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import {
  Sparkles, CreditCard, BarChart2, Users, CheckCircle2,
  PiggyBank, ChevronDown, Copy, Zap, Info,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/ai-tools")({
  component: () => (
    <AppShell>
      <AiToolsPage />
    </AppShell>
  ),
});

// ---------------------------------------------------------------------------
// Tool data — mirrors dispatcher.server.ts TOOL_DEFINITIONS
// ---------------------------------------------------------------------------

interface ToolExample {
  prompt: string;
}

interface Tool {
  name: string;
  description: string;
  examples: ToolExample[];
}

interface ToolCategory {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  iconBg: string;
  tools: Tool[];
}

const CATEGORIES: ToolCategory[] = [
  {
    id: "expense",
    label: "Expense Management",
    icon: CreditCard,
    color: "text-blue-400",
    iconBg: "bg-blue-500/20",
    tools: [
      {
        name: "add_expense",
        description: "Add a personal expense. Specify date, amount, category and an optional note.",
        examples: [
          { prompt: "Add ₹450 for lunch today under Food & Dining" },
          { prompt: "Log a ₹1200 Uber ride on 2026-05-28 under Transportation" },
          { prompt: "Add ₹3500 grocery shopping yesterday" },
          { prompt: "Record ₹800 movie tickets for Entertainment on Friday" },
        ],
      },
      {
        name: "list_expenses",
        description: "List all personal expenses within a date range.",
        examples: [
          { prompt: "Show my expenses this month" },
          { prompt: "List all expenses from May 1 to May 31" },
          { prompt: "What did I spend last week?" },
        ],
      },
      {
        name: "edit_expense",
        description: "Edit an existing personal expense — update amount, category, date or note.",
        examples: [
          { prompt: "Change the amount of my last Food expense to ₹600" },
          { prompt: "Update the note on expense ID abc123 to 'Team lunch'" },
        ],
      },
      {
        name: "delete_expense",
        description: "Delete a personal expense by its ID.",
        examples: [
          { prompt: "Delete expense ID abc123" },
          { prompt: "Remove the duplicate expense I just added" },
        ],
      },
    ],
  },
  {
    id: "reports",
    label: "Reports & Analytics",
    icon: BarChart2,
    color: "text-primary",
    iconBg: "bg-primary/20",
    tools: [
      {
        name: "summarize",
        description: "Get personal spending totals grouped by category for any date range.",
        examples: [
          { prompt: "Which category did I spend the most on this month?" },
          { prompt: "Summarize my spending from April 1 to April 30" },
          { prompt: "How much did I spend on Food this month?" },
          { prompt: "Break down my expenses by category for May" },
        ],
      },
      {
        name: "monthly_report",
        description: "Full monthly spending report with top categories, biggest expense, busiest day and weekday vs weekend breakdown.",
        examples: [
          { prompt: "Generate a monthly expense summary for May 2026" },
          { prompt: "Show me my full report for April" },
          { prompt: "What was my biggest expense in March?" },
          { prompt: "Compare my weekday vs weekend spending for this month" },
        ],
      },
    ],
  },
  {
    id: "groups",
    label: "Groups & Splitting",
    icon: Users,
    color: "text-green-400",
    iconBg: "bg-green-500/20",
    tools: [
      {
        name: "create_group",
        description: "Create a new expense-sharing group (trip, family, team or personal).",
        examples: [
          { prompt: "Create a group called Goa Trip 2026 of type trip" },
          { prompt: "Make a new family group named Home Expenses" },
        ],
      },
      {
        name: "list_my_groups",
        description: "List all groups you are a member of.",
        examples: [
          { prompt: "Show all my groups" },
          { prompt: "Which groups am I part of?" },
        ],
      },
      {
        name: "create_group_invite",
        description: "Generate an invite code so others can join your group.",
        examples: [
          { prompt: "Create an invite link for Goa Trip group" },
          { prompt: "Generate a 3-day invite code for group ID xyz" },
        ],
      },
      {
        name: "redeem_group_invite",
        description: "Join a group using an invite code.",
        examples: [
          { prompt: "Join group using invite code ABC123" },
          { prompt: "Redeem invite code goa-trip-2026" },
        ],
      },
      {
        name: "list_group_members",
        description: "List all members of a group with their roles.",
        examples: [
          { prompt: "Who are the members of Goa Trip group?" },
          { prompt: "List members of group ID xyz" },
        ],
      },
      {
        name: "add_group_expense",
        description: "Add a shared expense to a group, split equally among all members.",
        examples: [
          { prompt: "Add ₹5000 hotel expense to Goa Trip group for Accommodation" },
          { prompt: "Log ₹1200 dinner in Goa Trip under Food, paid by me" },
          { prompt: "Add ₹800 taxi to group xyz under Transportation" },
        ],
      },
      {
        name: "list_group_transactions",
        description: "List all transactions for a group, optionally filtered by date range.",
        examples: [
          { prompt: "Show all transactions in Goa Trip group" },
          { prompt: "List group expenses from May 1 to May 31" },
        ],
      },
      {
        name: "group_summary",
        description: "Get a spending breakdown by category for a group (approved expenses only).",
        examples: [
          { prompt: "How much does each member owe in Goa Trip?" },
          { prompt: "Show spending breakdown for Goa Trip group" },
          { prompt: "What categories did we spend on in the trip?" },
        ],
      },
      {
        name: "group_balances",
        description: "See each member's net balance — positive means others owe them.",
        examples: [
          { prompt: "Who owes what in Goa Trip?" },
          { prompt: "Show balances for group ID xyz" },
        ],
      },
      {
        name: "simplify_group_debts",
        description: "Get the minimum set of transfers needed to fully settle the group.",
        examples: [
          { prompt: "How do we settle up Goa Trip with minimum transfers?" },
          { prompt: "Simplify debts for group xyz" },
        ],
      },
      {
        name: "record_settlement",
        description: "Record a real payment between group members (UPI, cash, etc.).",
        examples: [
          { prompt: "Record that Rahul paid Priya ₹2000 in Goa Trip group" },
          { prompt: "Mark settlement of ₹1500 from user A to user B in group xyz" },
        ],
      },
      {
        name: "list_group_settlements",
        description: "List all recorded settlement payments for a group.",
        examples: [
          { prompt: "Show all settlements in Goa Trip group" },
          { prompt: "List payments made in group xyz this month" },
        ],
      },
    ],
  },
  {
    id: "approvals",
    label: "Approvals",
    icon: CheckCircle2,
    color: "text-emerald-400",
    iconBg: "bg-emerald-500/20",
    tools: [
      {
        name: "list_my_pending_approvals",
        description: "List all group expenses currently waiting for your approval.",
        examples: [
          { prompt: "What expenses need my approval?" },
          { prompt: "Show my pending approvals" },
        ],
      },
      {
        name: "approve_group_expense",
        description: "Approve a pending group expense by its transaction ID.",
        examples: [
          { prompt: "Approve transaction ID abc123" },
          { prompt: "Approve the pending hotel expense" },
        ],
      },
      {
        name: "reject_group_expense",
        description: "Reject a pending group expense.",
        examples: [
          { prompt: "Reject transaction ID abc123" },
          { prompt: "Decline the duplicate food expense" },
        ],
      },
      {
        name: "list_pending_group_expenses",
        description: "List all pending expenses for a specific group.",
        examples: [
          { prompt: "Show pending expenses in Goa Trip group" },
          { prompt: "What's waiting for approval in group xyz?" },
        ],
      },
      {
        name: "delete_group_expense",
        description: "Delete a pending group expense (only the submitter can do this while it's still pending).",
        examples: [
          { prompt: "Delete my pending expense ID abc123" },
          { prompt: "Remove the group expense I submitted by mistake" },
        ],
      },
    ],
  },
  {
    id: "budgets",
    label: "Budget Settings",
    icon: PiggyBank,
    color: "text-violet-400",
    iconBg: "bg-violet-500/20",
    tools: [
      {
        name: "list_budgets",
        description: "List all your active budgets with live actual spend for the current period.",
        examples: [
          { prompt: "Show all my budgets" },
          { prompt: "How am I doing against my budgets this month?" },
        ],
      },
      {
        name: "upsert_budget",
        description: "Create a new budget or update an existing one. Supports personal, category and group budget types with monthly, weekly, yearly or custom periods.",
        examples: [
          { prompt: "Create a monthly Food budget of ₹10000" },
          { prompt: "Set a ₹50000 budget for Goa Trip group" },
          { prompt: "Update my Transportation budget to ₹8000" },
          { prompt: "Create a weekly personal budget of ₹5000" },
        ],
      },
      {
        name: "delete_budget",
        description: "Delete (soft-delete) a budget by its ID.",
        examples: [
          { prompt: "Delete my Food budget" },
          { prompt: "Remove budget ID abc123" },
        ],
      },
    ],
  },
];

// Compute totals
const totalTools = CATEGORIES.reduce((s, c) => s + c.tools.length, 0);
const totalExamples = CATEGORIES.reduce(
  (s, c) => s + c.tools.reduce((ts, t) => ts + t.examples.length, 0),
  0,
);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function AiToolsPage() {
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyPrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt).then(() => {
      toast.success("Copied to clipboard");
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Tools Reference</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Everything you can do with natural language in the AI Workspace
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{totalTools}</div>
            <div className="text-[11px] text-muted-foreground">Tools</div>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{totalExamples}</div>
            <div className="text-[11px] text-muted-foreground">Example prompts</div>
          </div>
        </div>
      </div>

      {/* How it works banner */}
      <div className="glass rounded-2xl px-5 py-4 flex items-start gap-3 border border-primary/20">
        <div className="size-8 rounded-lg bg-primary/20 grid place-items-center shrink-0 mt-0.5">
          <Sparkles className="size-4 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold mb-0.5">How it works</div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Type any of these prompts (or your own variation) in the{" "}
            <a href="/chat" className="text-primary hover:underline font-medium">AI Workspace</a>{" "}
            on the dashboard or the AI tab. The AI understands natural language — you don't need to
            use exact wording. Click{" "}
            <span className="inline-flex items-center gap-1 text-foreground font-medium">
              <Zap className="size-3 text-primary" /> Try
            </span>{" "}
            to send a prompt directly, or{" "}
            <span className="inline-flex items-center gap-1 text-foreground font-medium">
              <Copy className="size-3" /> Copy
            </span>{" "}
            to paste it yourself.
          </p>
        </div>
      </div>

      {/* Category accordions */}
      <div className="space-y-3">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isOpen = openCategories.has(cat.id);
          return (
            <div key={cat.id} className="glass rounded-2xl overflow-hidden border border-border">
              {/* Category header */}
              <button
                onClick={() => toggle(cat.id)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-accent/30 transition-colors text-left"
              >
                <div className={`size-9 rounded-xl grid place-items-center shrink-0 ${cat.iconBg}`}>
                  <Icon className={`size-4 ${cat.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-sm">{cat.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {cat.tools.length} tool{cat.tools.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <ChevronDown
                  className={`size-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                />
              </button>

              {/* Tools list */}
              {isOpen && (
                <div className="border-t border-border divide-y divide-border/60">
                  {cat.tools.map((tool) => (
                    <ToolRow
                      key={tool.name}
                      tool={tool}
                      accentColor={cat.color}
                      onCopy={copyPrompt}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer tip */}
      <p className="text-center text-xs text-muted-foreground pb-4">
        Tip: You don't need exact wording. The AI understands context —{" "}
        <span className="text-foreground">"add 500 for lunch"</span> works just as well as{" "}
        <span className="text-foreground">"I spent 500 on food"</span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool row
// ---------------------------------------------------------------------------

function ToolRow({
  tool,
  accentColor,
  onCopy,
}: {
  tool: Tool;
  accentColor: string;
  onCopy: (p: string) => void;
}) {
  const [showExamples, setShowExamples] = useState(false);

  return (
    <div className="px-5 py-4 space-y-3">
      {/* Tool header */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className={`text-xs font-mono font-semibold px-2 py-0.5 rounded bg-secondary ${accentColor}`}>
              {tool.name}
            </code>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            {tool.description}
          </p>
        </div>
        <button
          onClick={() => setShowExamples((s) => !s)}
          className="shrink-0 h-7 px-2.5 rounded-lg bg-secondary/60 border border-border text-[11px] flex items-center gap-1.5 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <Info className="size-3" />
          {showExamples ? "Hide" : `${tool.examples.length} example${tool.examples.length !== 1 ? "s" : ""}`}
        </button>
      </div>

      {/* Example prompts */}
      {showExamples && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-0">
          {tool.examples.map((ex, i) => (
            <div
              key={i}
              className="group flex items-center gap-2 rounded-xl bg-secondary/40 border border-border/60 px-3 py-2.5 hover:bg-accent/40 transition-colors"
            >
              <p className="flex-1 text-xs text-foreground/80 leading-relaxed">
                "{ex.prompt}"
              </p>
              <button
                onClick={() => onCopy(ex.prompt)}
                title="Copy prompt"
                className="shrink-0 size-6 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent opacity-0 group-hover:opacity-100 transition-all"
              >
                <Copy className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
