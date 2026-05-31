import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useState, useMemo } from "react";
import { getLocalUser, type LocalUser } from "@/lib/api-key";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { mcpCall } from "@/lib/mcp/mcp.functions";
import { toast } from "sonner";
import {
  Plus, Search, MoreVertical, Users,
  ChevronDown, X, Check, Copy, Link,
} from "lucide-react";

export const Route = createFileRoute("/groups")({ component: () => <AppShell><GroupsPage /></AppShell> });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtINR(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function timeAgo(iso?: string) {
  if (!iso) return "";
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const KIND_COLORS: Record<string, string> = {
  trip: "bg-blue-500/20 text-blue-400",
  family: "bg-green-500/20 text-green-400",
  team: "bg-purple-500/20 text-purple-400",
  personal_mirror: "bg-orange-500/20 text-orange-400",
};

const KIND_EMOJI: Record<string, string> = {
  trip: "✈️", family: "🏠", team: "💼", personal_mirror: "👤",
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function GroupsPage() {
  const [apiKey, setApiKey] = useState("");
  const [localUser, setLocalUser] = useState<LocalUser | null>(null);
  const [search, setSearch] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selected, setSelected] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState("trip");
  const [inviteEmails, setInviteEmails] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [inviteCodes, setInviteCodes] = useState<Record<string, string>>({});
  const [loadingCodeId, setLoadingCodeId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  useEffect(() => {
    const u = getLocalUser();
    setApiKey(u?.apiKey ?? "");
    setLocalUser(u);
  }, []);

  // Close 3-dot menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = () => setMenuOpenId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [menuOpenId]);

  const callTool = useServerFn(mcpCall);
  const qc = useQueryClient();

  // Groups list
  const groupsQ = useQuery({
    enabled: !!apiKey,
    queryKey: ["groups", apiKey],
    queryFn: async () => {
      const r = await callTool({ data: { apiKey, name: "list_my_groups", args: {} } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = r.ok ? r.data : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (Array.isArray(data) ? data : (data as any)?.groups ?? []) as any[];
    },
  });

  // Members of selected group
  const membersQ = useQuery({
    enabled: !!apiKey && !!selected,
    queryKey: ["group-members", selected?.id ?? selected?.group_id, apiKey],
    queryFn: async () => {
      const gid = selected?.id ?? selected?.group_id;
      const r = await callTool({ data: { apiKey, name: "list_group_members", args: { group_id: gid } } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return r.ok ? (Array.isArray(r.data) ? r.data : (r.data as any)?.members ?? []) as any[] : [];
    },
  });

  // Recent transactions of selected group
  const txQ = useQuery({
    enabled: !!apiKey && !!selected,
    queryKey: ["group-tx", selected?.id ?? selected?.group_id, apiKey],
    queryFn: async () => {
      const gid = selected?.id ?? selected?.group_id;
      const r = await callTool({ data: { apiKey, name: "list_group_transactions", args: { group_id: gid } } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return r.ok ? (Array.isArray(r.data) ? r.data : (r.data as any)?.transactions ?? []) as any[] : [];
    },
  });

  // Group summary (spending breakdown)
  const summaryQ = useQuery({
    enabled: !!apiKey && !!selected,
    queryKey: ["group-summary", selected?.id ?? selected?.group_id, apiKey],
    queryFn: async () => {
      const gid = selected?.id ?? selected?.group_id;
      const r = await callTool({ data: { apiKey, name: "group_summary", args: { group_id: gid } } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return r.ok ? r.data as any : null;
    },
  });

  // Group balances (who owes whom)
  const balancesQ = useQuery({
    enabled: !!apiKey && !!selected,
    queryKey: ["group-balances", selected?.id ?? selected?.group_id, apiKey],
    retry: false, // don't retry on SQL errors
    queryFn: async () => {
      const gid = selected?.id ?? selected?.group_id;
      const r = await callTool({ data: { apiKey, name: "group_balances", args: { group_id: gid, include_settlements: false } } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return r.ok ? r.data as any : null;
    },
  });

  // Create group + send invites
  const createMut = useMutation({
    mutationFn: async () => {
      // Step 1: create the group
      const r = await callTool({ data: { apiKey, name: "create_group", args: { name: newName, kind: newKind } } });
      if (!r.ok) throw new Error(r.error);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const groupId: string = (r.data as any)?.group_id ?? "";

      // Step 2: send invites if emails were provided
      const emails = inviteEmails.trim();
      if (emails && groupId) {
        const inviteR = await callTool({
          data: { apiKey, name: "send_group_invite", args: { group_id: groupId, emails } },
        });
        if (!inviteR.ok) throw new Error(`Group created but invite failed: ${inviteR.error}`);
      }
      return r.data;
    },
    onSuccess: () => {
      toast.success("Group created and invites sent!");
      setNewName(""); setNewKind("trip"); setInviteEmails(""); setEmailInput(""); setShowCreate(false);
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // Join group with invite code
  const joinMut = useMutation({
    mutationFn: async () => {
      const r = await callTool({ data: { apiKey, name: "redeem_group_invite", args: { invite_code: joinCode.trim() } } });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    onSuccess: (data) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const returnedGroupId: string = (data as any)?.group_id ?? "";
      const currentGroupIds = (groupsQ.data ?? []).map((g: any) => g.id ?? g.group_id);
      if (returnedGroupId && currentGroupIds.includes(returnedGroupId)) {
        toast.info("You are already a member of this group.");
        setJoinCode(""); setShowJoin(false);
        return;
      }
      toast.success("Joined group successfully!");
      setJoinCode(""); setShowJoin(false);
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message.toLowerCase() : "";
      if (msg.includes("already") || msg.includes("duplicate") || msg.includes("exists")) {
        toast.info("You are already a member of this group.");
      } else {
        toast.error(e instanceof Error ? e.message : "Invalid or expired code");
      }
    },
  });

  const filtered = useMemo(() => {
    const list = [...(groupsQ.data ?? [])];
    // Always sort by most recently created first
    list.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    if (!search.trim()) return list;
    return list.filter((g) => String(g.name ?? "").toLowerCase().includes(search.toLowerCase()));
  }, [groupsQ.data, search]);

  // Reset to page 1 when search changes
  useEffect(() => { setPage(1); }, [search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Auto-select first group
  useEffect(() => {
    if (!selected && filtered.length > 0) setSelected(filtered[0]);
  }, [filtered, selected]);

  // KPI totals across all groups — kept for potential future use
  const _totalGroups = groupsQ.data?.length ?? 0;

  async function getInviteCode(groupId: string) {
    if (inviteCodes[groupId]) return; // already fetched
    setLoadingCodeId(groupId);
    try {
      const r = await callTool({ data: { apiKey, name: "create_group_invite", args: { group_id: groupId, expires_in_days: 7 } } });
      if (r.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const code = (r.data as any)?.invite_code ?? "";
        setInviteCodes((p) => ({ ...p, [groupId]: code }));
      } else {
        toast.error("Failed to get invite code");
      }
    } finally {
      setLoadingCodeId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Groups</h1>
          <p className="text-sm text-muted-foreground">Manage your groups and track shared expenses</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowJoin(true)}
            className="h-9 px-4 rounded-lg border border-border text-sm font-medium flex items-center gap-2 hover:bg-accent transition-colors"
          >
            <Users className="size-4" /> Join with Code
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="h-9 px-4 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90"
          >
            <Plus className="size-4" /> New Group
          </button>
        </div>
      </div>

      {/* Main content: list + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left: group list */}
        <div className="lg:col-span-3 glass rounded-2xl overflow-hidden flex flex-col">
          {/* List header */}
          <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
            <div className="font-semibold">All Groups</div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search groups…"
                className="h-8 pl-8 pr-3 rounded-lg bg-input border border-border text-xs focus:outline-none focus:ring-1 focus:ring-ring w-44"
              />
            </div>
          </div>

          {/* Group rows */}
          <div className="flex-1 overflow-auto divide-y divide-border">
            {groupsQ.isLoading && (
              <div className="p-6 text-sm text-muted-foreground">Loading…</div>
            )}
            {!groupsQ.isLoading && filtered.length === 0 && (
              <div className="p-8 text-center">
                <div className="text-4xl mb-3">👥</div>
                <div className="font-medium mb-1">Create a new group</div>
                <div className="text-sm text-muted-foreground mb-4">Add friends or teammates and start tracking shared expenses.</div>
                <button onClick={() => setShowCreate(true)} className="h-8 px-4 rounded-lg bg-primary text-primary-foreground text-sm flex items-center gap-1.5 mx-auto hover:opacity-90">
                  <Plus className="size-3.5" /> Create Group
                </button>
              </div>
            )}
            {paginated.map((g, i) => {
              const gid = g.id ?? g.group_id;
              const isSelected = (selected?.id ?? selected?.group_id) === gid;
              return (
                <div
                  key={gid ?? i}
                  onClick={() => setSelected(g)}
                  className={`flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors ${isSelected ? "bg-primary/10" : "hover:bg-accent/40"}`}
                >
                  {/* Avatar */}
                  <div className={`size-11 rounded-xl grid place-items-center text-xl shrink-0 ${KIND_COLORS[g.kind] ?? "bg-secondary"}`}>
                    {KIND_EMOJI[g.kind] ?? "👥"}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium truncate">{g.name}</div>
                      {g.role === "owner" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-semibold">Admin</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {g.member_count ? `${g.member_count} members` : "—"} • Created on {g.created_at ? new Date(g.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </div>
                  </div>

                  {/* Stats removed — Total Spent and Balance not shown in list */}

                  {/* 3-dots menu */}
                  <div className="relative shrink-0">
                    <button
                      className="text-muted-foreground hover:text-foreground p-1 rounded"
                      onClick={(e) => {
                        e.stopPropagation();
                        const id = gid as string;
                        if (menuOpenId === id) {
                          setMenuOpenId(null);
                        } else {
                          setMenuOpenId(id);
                          getInviteCode(id);
                        }
                      }}
                    >
                      <MoreVertical className="size-4" />
                    </button>

                    {menuOpenId === gid && (
                      <div
                        className="absolute right-0 top-8 z-50 w-64 glass rounded-xl border border-border shadow-2xl p-3 space-y-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="text-[11px] text-muted-foreground font-medium px-1 mb-1 flex items-center gap-1.5">
                          <Link className="size-3" /> Invite Code
                        </div>
                        {loadingCodeId === gid ? (
                          <div className="text-xs text-muted-foreground px-1">Generating…</div>
                        ) : inviteCodes[gid as string] ? (
                          <>
                            <div className="flex items-center gap-2 bg-secondary/60 rounded-lg px-3 py-2 border border-border">
                              <code className="flex-1 text-sm font-mono text-primary tracking-wider">
                                {inviteCodes[gid as string]}
                              </code>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(inviteCodes[gid as string]);
                                  toast.success("Code copied!");
                                }}
                                className="text-muted-foreground hover:text-foreground shrink-0"
                                title="Copy code"
                              >
                                <Copy className="size-3.5" />
                              </button>
                            </div>
                            <p className="text-[10px] text-muted-foreground px-1">
                              Share this code — expires in 7 days
                            </p>
                          </>
                        ) : (
                          <div className="text-xs text-muted-foreground px-1">Could not generate code</div>
                        )}
                        <button
                          onClick={() => setMenuOpenId(null)}
                          className="w-full text-xs text-muted-foreground hover:text-foreground text-center pt-1"
                        >
                          Close
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer with pagination */}
          {filtered.length > 0 && (
            <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} group{filtered.length !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="h-7 w-7 rounded-lg border border-border text-xs grid place-items-center hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ‹
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`h-7 w-7 rounded-lg border text-xs grid place-items-center transition-colors ${
                      p === page
                        ? "border-primary bg-primary/20 text-primary font-semibold"
                        : "border-border hover:bg-accent text-muted-foreground"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="h-7 w-7 rounded-lg border border-border text-xs grid place-items-center hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: group detail panel */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="glass rounded-2xl p-8 text-center text-muted-foreground h-full flex flex-col items-center justify-center gap-3">
              <Users className="size-10 text-primary/40" />
              <div className="text-sm">Select a group to view details</div>
            </div>
          ) : (
            <GroupDetail
              group={selected}
              members={membersQ.data ?? []}
              membersLoading={membersQ.isLoading}
              transactions={txQ.data ?? []}
              txLoading={txQ.isLoading}
              summary={summaryQ.data}
              summaryLoading={summaryQ.isLoading}
              balances={balancesQ.data}
              balancesLoading={balancesQ.isLoading}
              localUser={localUser}
            />
          )}
        </div>
      </div>

      {/* Join group modal */}
      {showJoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="font-semibold text-lg">Join a Group</div>
              <button onClick={() => { setShowJoin(false); setJoinCode(""); }} className="text-muted-foreground hover:text-foreground">
                <X className="size-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Invite Code</label>
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && joinCode.trim()) joinMut.mutate(); }}
                  placeholder="Paste your invite code here…"
                  className="w-full h-10 px-3 rounded-lg bg-input border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring tracking-wider"
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Ask the group admin for the invite code from the 3-dots menu.
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setShowJoin(false); setJoinCode(""); }}
                  className="flex-1 h-10 rounded-lg border border-border text-sm hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  disabled={!joinCode.trim() || joinMut.isPending}
                  onClick={() => joinMut.mutate()}
                  className="flex-1 h-10 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90"
                >
                  {joinMut.isPending ? "Joining…" : "Join Group"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create group modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="font-semibold text-lg">Create a new group</div>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                <X className="size-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Group name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Goa Trip 2024"
                  className="w-full h-10 px-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "trip", label: "Trip", emoji: "✈️" },
                    { value: "family", label: "Family", emoji: "🏠" },
                    { value: "team", label: "Team", emoji: "💼" },
                    { value: "personal_mirror", label: "Personal", emoji: "👤" },
                  ].map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => setNewKind(k.value)}
                      className={`h-12 rounded-xl border text-sm flex items-center gap-2 px-3 transition-colors ${newKind === k.value ? "border-primary bg-primary/15 text-primary" : "border-border bg-input hover:bg-accent"}`}
                    >
                      <span className="text-lg">{k.emoji}</span>
                      <span className="font-medium">{k.label}</span>
                      {newKind === k.value && <Check className="size-3.5 ml-auto" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Email invites */}
              <div>
                <label className="text-sm font-medium block mb-1">
                  Invite members <span className="text-muted-foreground font-normal">(required)</span>
                </label>
                {/* Email tag input */}
                <div className="min-h-[42px] w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus-within:ring-2 focus-within:ring-ring flex flex-wrap gap-1.5 items-center">
                  {inviteEmails.split(",").filter(e => e.trim()).map((email, i) => (
                    <span key={i} className="flex items-center gap-1 bg-primary/20 text-primary text-xs px-2 py-0.5 rounded-full">
                      {email.trim()}
                      <button
                        type="button"
                        onClick={() => {
                          const list = inviteEmails.split(",").filter(e => e.trim());
                          list.splice(i, 1);
                          setInviteEmails(list.join(","));
                        }}
                        className="hover:text-destructive ml-0.5"
                      >
                        <X className="size-2.5" />
                      </button>
                    </span>
                  ))}
                  <input
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "," || e.key === " ") {
                        e.preventDefault();
                        const val = emailInput.trim().replace(/,$/, "");
                        if (val && val.includes("@")) {
                          setInviteEmails(p => p ? `${p},${val}` : val);
                          setEmailInput("");
                        }
                      }
                      if (e.key === "Backspace" && !emailInput && inviteEmails) {
                        const list = inviteEmails.split(",").filter(e => e.trim());
                        list.pop();
                        setInviteEmails(list.join(","));
                      }
                    }}
                    onBlur={() => {
                      const val = emailInput.trim().replace(/,$/, "");
                      if (val && val.includes("@")) {
                        setInviteEmails(p => p ? `${p},${val}` : val);
                        setEmailInput("");
                      }
                    }}
                    placeholder={inviteEmails ? "" : "Type email and press Enter…"}
                    className="flex-1 min-w-[160px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Press Enter or comma after each email. Invite links will be sent automatically.
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowCreate(false); setInviteEmails(""); setEmailInput(""); }} className="flex-1 h-10 rounded-lg border border-border text-sm hover:bg-accent">
                  Cancel
                </button>
                <button
                  disabled={!newName.trim() || !inviteEmails.trim() || createMut.isPending}
                  onClick={() => createMut.mutate()}
                  className="flex-1 h-10 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90"
                >
                  {createMut.isPending ? "Creating…" : "Create & Send Invites"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group detail panel
// ---------------------------------------------------------------------------

function GroupDetail({
  group, members, membersLoading, transactions, txLoading,
  summary, summaryLoading, balances, balancesLoading, localUser,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  group: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  members: any[];
  membersLoading: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transactions: any[];
  txLoading: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summary: any;
  summaryLoading: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  balances: any;
  balancesLoading: boolean;
  localUser: LocalUser | null;
}) {
  const [showAllMembers, setShowAllMembers] = useState(false);
  const visibleMembers = showAllMembers ? members : members.slice(0, 4);

  // group_summary → { group_id, total_spent, transaction_count, breakdown_by_category }
  const totalSpent: number = Number(summary?.total_spent ?? 0);

  // group_balances → { group_id, net_by_user_id: { uuid: balance } }
  const netByUser: Record<string, number> = {};
  if (balances?.net_by_user_id && typeof balances.net_by_user_id === "object") {
    for (const [k, v] of Object.entries(balances.net_by_user_id)) {
      netByUser[k] = Number(v);
    }
  }

  // Current user = owner member
  const myMember = members.find((m) => m.role === "owner") ?? members[0];
  const myUserId: string = myMember?.user_id ?? "";
  const myBalance: number = myUserId ? (netByUser[myUserId] ?? 0) : 0;
  const iOwe = myBalance < 0 ? Math.abs(myBalance) : 0;
  const owedToMe = myBalance > 0 ? myBalance : 0;

  function displayName(userId: string): string {
    if (!userId) return "Unknown";
    if (userId === myUserId && localUser) {
      return localUser.name ?? localUser.email.split("@")[0];
    }
    const idx = members.findIndex((m) => m.user_id === userId);
    return idx >= 0 ? `Member ${idx + 1}` : userId.slice(0, 8);
  }

  return (
    <div className="glass rounded-2xl overflow-hidden flex flex-col gap-0">
      {/* Cover */}
      <div className="relative h-28 bg-gradient-to-br from-primary/30 via-primary/10 to-transparent">
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: "radial-gradient(circle at 30% 50%, #a78bfa 0%, transparent 60%), radial-gradient(circle at 80% 20%, #60a5fa 0%, transparent 50%)",
        }} />
        <button className="absolute top-3 right-3 size-7 rounded-full bg-black/30 grid place-items-center hover:bg-black/50 transition">
          <span className="text-white text-xs">✏️</span>
        </button>
      </div>

      <div className="px-5 pb-5 -mt-6 space-y-4">
        {/* Group identity */}
        <div className="flex items-end gap-3">
          <div className={`size-14 rounded-xl grid place-items-center text-2xl shrink-0 border-2 border-background ${KIND_COLORS[group.kind] ?? "bg-secondary"}`}>
            {KIND_EMOJI[group.kind] ?? "👥"}
          </div>
          <div className="pb-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-bold text-base truncate">{group.name}</div>
              {group.role === "owner" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-semibold">Admin</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {members.length > 0 ? `${members.length} members` : "—"} • Created on {group.created_at ? new Date(group.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-secondary/50 p-3 text-center">
            <div className="text-[10px] text-muted-foreground mb-1">Total Spent</div>
            <div className="font-bold text-sm">
              {summaryLoading ? "…" : fmtINR(totalSpent)}
            </div>
          </div>
          <div className="rounded-xl bg-success/10 p-3 text-center">
            <div className="text-[10px] text-muted-foreground mb-1">You are owed</div>
            <div className="font-bold text-sm text-success">
              {balancesLoading ? "…" : fmtINR(owedToMe)}
            </div>
          </div>
          <div className="rounded-xl bg-warning/10 p-3 text-center">
            <div className="text-[10px] text-muted-foreground mb-1">You owe</div>
            <div className="font-bold text-sm text-warning">
              {balancesLoading ? "…" : fmtINR(iOwe)}
            </div>
          </div>
        </div>

        {/* Members */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">Members ({members.length})</div>
            <button className="text-xs text-primary hover:underline">Manage</button>
          </div>
          {membersLoading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : members.length === 0 ? (
            <div className="text-xs text-muted-foreground">No members found.</div>
          ) : (
            <div className="space-y-2.5">
              {visibleMembers.map((m, i) => {
                const uid: string = m.user_id ?? "";
                const isMe = uid === myUserId;
                const name = isMe
                  ? (localUser?.name ?? localUser?.email?.split("@")[0] ?? "You")
                  : `Member ${i + 1}`;
                const balance: number = netByUser[uid] ?? 0;
                const initial = name.slice(0, 1).toUpperCase();

                return (
                  <div key={uid || i} className="flex items-center gap-2.5">
                    <div className="size-8 rounded-full bg-primary/20 grid place-items-center text-primary text-xs font-bold shrink-0">
                      {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{name}</span>
                        {isMe && <span className="text-[10px] px-1 py-0.5 rounded bg-primary/15 text-primary">You</span>}
                        {m.role === "owner" && <span className="text-[10px] px-1 py-0.5 rounded bg-secondary text-muted-foreground">Admin</span>}
                      </div>
                    </div>
                    <div className="text-right text-xs shrink-0">
                      {balance > 0 ? (
                        <span className="text-success font-medium">{fmtINR(balance)} owed to {isMe ? "you" : "them"}</span>
                      ) : balance < 0 ? (
                        <span className="text-warning font-medium">{fmtINR(Math.abs(balance))} owes</span>
                      ) : (
                        <span className="text-muted-foreground">settled up</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {members.length > 4 && (
                <button
                  onClick={() => setShowAllMembers((s) => !s)}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  {showAllMembers ? "Show less" : `+ ${members.length - 4} more members`}
                  <ChevronDown className={`size-3 transition-transform ${showAllMembers ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">Recent Activity</div>
            <button className="text-xs text-primary hover:underline">View all</button>
          </div>
          {txLoading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : transactions.length === 0 ? (
            <div className="text-xs text-muted-foreground">No transactions yet.</div>
          ) : (
            <div className="space-y-2">
              {transactions.slice(0, 5).map((tx, i) => {
                const cat = String(tx.category ?? "Expense");
                const amt = Number(tx.amount ?? 0);
                const when = tx.created_at ?? tx.expense_date;
                const submitter = displayName(tx.submitted_by ?? "");
                return (
                  <div key={tx.id ?? i} className="flex items-center gap-2.5">
                    <div className="size-8 rounded-lg bg-secondary grid place-items-center text-sm shrink-0 font-medium">
                      {cat.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {submitter} added an expense
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{tx.note || cat}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-semibold">{fmtINR(amt)}</div>
                      <div className="text-[10px] text-muted-foreground">{timeAgo(when)}</div>
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

