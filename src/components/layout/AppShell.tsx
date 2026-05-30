import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bell, Home, Sparkles, Users, Receipt, ClipboardCheck,
  FileText, Settings, Moon, Sun, LogOut, PiggyBank, Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clearLocalUser, getLocalUser, type LocalUser } from "@/lib/api-key";
import { useQuery } from "@tanstack/react-query";
import { mcpCall } from "@/lib/mcp/mcp.functions";
import { useServerFn } from "@tanstack/react-start";

const NAV = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/groups", label: "Groups", icon: Users },
  { to: "/approvals", label: "Approvals", icon: ClipboardCheck, badgeKey: "approvals" as const },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/chat", label: "AI Workspace", icon: Sparkles, badge: "Beta" },
  { to: "/ai-tools", label: "AI Tools", icon: Wrench },
  { to: "/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const loc = useLocation();
  const [user, setUser] = useState<LocalUser | null>(null);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const u = getLocalUser();
    if (!u?.apiKey) {
      navigate({ to: "/login" });
      return;
    }
    setUser(u);
  }, [navigate]);

  useEffect(() => {
    document.documentElement.classList.toggle("light", !dark);
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const callTool = useServerFn(mcpCall);
  const approvals = useQuery({
    queryKey: ["approvals-count", user?.apiKey],
    enabled: !!user?.apiKey,
    refetchInterval: 30_000,
    queryFn: async () => {
      const r = await callTool({ data: { apiKey: user!.apiKey, name: "list_my_pending_approvals", args: {} } });
      if (!r.ok) return 0;
      const data = r.data as unknown;
      const list = Array.isArray((data as { pending?: unknown[] })?.pending)
        ? (data as { pending: unknown[] }).pending
        : Array.isArray(data) ? data : [];
      return list.length;
    },
  });

  if (!user) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;

  const handleSignOut = () => {
    clearLocalUser();
    navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-sidebar-border bg-sidebar p-4 gap-1 sticky top-0 h-screen">
        <Link to="/" className="flex items-center gap-3 px-2 py-3 mb-4">
          <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center ring-glow">
            <span className="text-primary-foreground font-bold text-sm">PL</span>
          </div>
          <div>
            <div className="font-bold leading-tight tracking-tight">
              <span className="text-foreground">Prompt</span><span className="text-primary">Ledger</span>
            </div>
            <div className="text-[11px] text-muted-foreground">Expense Tracker</div>
          </div>
        </Link>

        {NAV.map((item) => {
          const active = loc.pathname === item.to || (item.to !== "/" && loc.pathname.startsWith(item.to));
          const Icon = item.icon;
          const badgeCount = item.badgeKey === "approvals" ? approvals.data : undefined;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-active text-sidebar-active-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-active/40"
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                  {item.badge}
                </span>
              )}
              {typeof badgeCount === "number" && badgeCount > 0 && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-destructive text-destructive-foreground">
                  {badgeCount}
                </span>
              )}
            </Link>
          );
        })}

        {/* User card */}
        <div className="mt-auto p-3 rounded-xl glass flex items-center gap-3">
          <div className="size-9 rounded-full bg-primary/20 grid place-items-center text-primary font-semibold">
            {(user.name ?? user.email).slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{user.name ?? user.email.split("@")[0]}</div>
            <div className="text-xs text-muted-foreground truncate">{user.email}</div>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-10 backdrop-blur bg-background/70 border-b border-border px-6 py-3 flex items-center gap-3">
          <div className="md:hidden font-bold"><span className="text-foreground">Prompt</span><span className="text-primary">Ledger</span></div>
          <div className="flex-1" />
          <button
            className="relative size-9 rounded-full bg-secondary grid place-items-center hover:bg-accent transition"
            title="Notifications"
          >
            <Bell className="size-4" />
            {(approvals.data ?? 0) > 0 && (
              <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" />
            )}
          </button>
          <button
            onClick={() => setDark(!dark)}
            className="size-9 rounded-full bg-secondary grid place-items-center hover:bg-accent transition"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </header>
        <div className="p-6 flex-1 min-w-0">{children}</div>
      </main>
    </div>
  );
}
