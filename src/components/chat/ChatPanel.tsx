import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  Send, Sparkles, Wrench, CheckCircle2, AlertCircle,
  Mic, MicOff, X, KeyRound,
  ThumbsUp, ThumbsDown, BarChart2, List, GitCompare,
  Plus, Wrench as ToolsIcon, FileText, Image,
  CreditCard, Users, PiggyBank, ChevronDown,
} from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any;

// ---------------------------------------------------------------------------
// Tools popover data
// ---------------------------------------------------------------------------

const TOOL_GROUPS = [
  {
    id: "expense",
    label: "Expense Management",
    icon: CreditCard,
    color: "text-blue-400",
    bg: "bg-blue-500/20",
    tools: [
      { name: "add_expense", desc: "Add a personal expense" },
      { name: "list_expenses", desc: "List expenses by date range" },
      { name: "edit_expense", desc: "Edit an existing expense" },
      { name: "delete_expense", desc: "Delete an expense by ID" },
    ],
  },
  {
    id: "reports",
    label: "Reports & Analytics",
    icon: BarChart2,
    color: "text-primary",
    bg: "bg-primary/20",
    tools: [
      { name: "summarize", desc: "Spending totals by category" },
      { name: "monthly_report", desc: "Full monthly spending report" },
    ],
  },
  {
    id: "groups",
    label: "Groups & Splitting",
    icon: Users,
    color: "text-green-400",
    bg: "bg-green-500/20",
    tools: [
      { name: "create_group", desc: "Create a new group" },
      { name: "list_my_groups", desc: "List all your groups" },
      { name: "create_group_invite", desc: "Generate an invite code" },
      { name: "redeem_group_invite", desc: "Join a group via invite" },
      { name: "list_group_members", desc: "List members of a group" },
      { name: "add_group_expense", desc: "Add a shared group expense" },
      { name: "list_group_transactions", desc: "List group transactions" },
      { name: "group_summary", desc: "Group spending breakdown" },
      { name: "group_balances", desc: "Net balance per member" },
      { name: "simplify_group_debts", desc: "Minimum transfers to settle" },
      { name: "record_settlement", desc: "Record a payment between members" },
      { name: "list_group_settlements", desc: "List settlement payments" },
    ],
  },
  {
    id: "approvals",
    label: "Approvals",
    icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-500/20",
    tools: [
      { name: "list_my_pending_approvals", desc: "Expenses waiting for your approval" },
      { name: "approve_group_expense", desc: "Approve a pending expense" },
      { name: "reject_group_expense", desc: "Reject a pending expense" },
      { name: "list_pending_group_expenses", desc: "Pending expenses in a group" },
      { name: "delete_group_expense", desc: "Delete a pending group expense" },
    ],
  },
  {
    id: "budgets",
    label: "Budget Settings",
    icon: PiggyBank,
    color: "text-violet-400",
    bg: "bg-violet-500/20",
    tools: [
      { name: "list_budgets", desc: "List all budgets with live spend" },
      { name: "upsert_budget", desc: "Create or update a budget" },
      { name: "delete_budget", desc: "Delete a budget" },
    ],
  },
];

const TOTAL_TOOLS = TOOL_GROUPS.reduce((s, g) => s + g.tools.length, 0);

type ToolEvent = { id: string; name: string; ok?: boolean; args?: unknown; data?: unknown };
type Msg =
  | { role: "user"; content: string; time?: string }
  | { role: "assistant"; content: string; tools?: ToolEvent[]; isError?: boolean; time?: string };

// Suggestion cards shown on empty state
const SUGGESTIONS = [
  { icon: BarChart2, label: "Show my expenses", sub: "this month", color: "text-primary" },
  { icon: List, label: "Which category did I", sub: "spend the most on?", color: "text-info" },
  { icon: Sparkles, label: "How much does each", sub: "member owe in Goa Trip?", color: "text-success" },
  { icon: GitCompare, label: "Generate a monthly", sub: "expense summary", color: "text-warning" },
];

// Action buttons shown below AI responses
const MSG_ACTIONS = [
  { icon: BarChart2, label: "Explain more" },
  { icon: List, label: "Show transactions" },
  { icon: GitCompare, label: "Compare with last month" },
];

function nowTime() {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

// ---------------------------------------------------------------------------
// Tools popover
// ---------------------------------------------------------------------------

function ToolsPopover(_props: { onSelectTool: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`h-7 px-2 rounded-lg text-xs flex items-center gap-1 transition-colors shrink-0 ${
          open
            ? "bg-primary/20 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
      >
        <ToolsIcon className="size-3.5" />
        Tools
        <ChevronDown className={`size-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-80 glass rounded-2xl border border-border shadow-2xl overflow-hidden z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="size-3.5 text-primary" />
              <span className="text-xs font-semibold">Available AI Tools</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-semibold">
              {TOTAL_TOOLS} tools
            </span>
          </div>

          {/* Groups */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border/60">
            {TOOL_GROUPS.map((group) => {
              const Icon = group.icon;
              const isExpanded = expandedGroup === group.id;
              return (
                <div key={group.id}>
                  {/* Group header */}
                  <button
                    type="button"
                    onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-accent/40 transition-colors text-left"
                  >
                    <div className={`size-6 rounded-md grid place-items-center shrink-0 ${group.bg}`}>
                      <Icon className={`size-3.5 ${group.color}`} />
                    </div>
                    <span className="flex-1 text-xs font-medium">{group.label}</span>
                    <span className="text-[10px] text-muted-foreground mr-1">
                      {group.tools.length}
                    </span>
                    <ChevronDown
                      className={`size-3 text-muted-foreground transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </button>

                  {/* Tool list */}
                  {isExpanded && (
                    <div className="bg-secondary/20 divide-y divide-border/40">
                      {group.tools.map((tool) => (
                        <button
                          key={tool.name}
                          type="button"
                          className="w-full flex items-start gap-2.5 px-4 py-2 hover:bg-accent/50 transition-colors text-left group"
                        >
                          <code className={`text-[10px] font-mono font-semibold mt-0.5 shrink-0 ${group.color}`}>
                            {tool.name}
                          </code>
                          <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors leading-relaxed">
                           {tool.desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-border">
            <p className="text-[10px] text-muted-foreground text-center">
              Use natural language to invoke any tool
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function ChatPanel({ apiKey, userName = "there" }: { apiKey: string; userName?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<{ name: string; dataUrl: string; type: string }[]>([]);
  const [listening, setListening] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recogRef = useRef<SR>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const onPickFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: { name: string; dataUrl: string; type: string }[] = [];
    for (const f of Array.from(files).slice(0, 4)) {
      if (f.size > 5 * 1024 * 1024) {
        toast.error(`${f.name} is too large (max 5 MB)`);
        continue;
      }
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(f);
      });
      next.push({ name: f.name, dataUrl, type: f.type });
    }
    if (next.length > 0) setAttachments((p) => [...p, ...next].slice(0, 4));
  };

  const toggleMic = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const W = window as any;
    const SpeechRecognition = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Voice input isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    if (listening) {
      recogRef.current?.stop();
      return;
    }
    const r = new SpeechRecognition();
    r.lang = "en-IN";
    r.interimResults = true;
    r.continuous = false;
    let finalText = "";
    r.onresult = (e: SR) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setInput((finalText + interim).trim());
    };
    r.onend = () => setListening(false);
    r.onerror = (e: SR) => {
      setListening(false);
      const code: string = e.error ?? "";
      if (code === "not-allowed") toast.error("Microphone access denied. Allow mic in browser settings.");
      else if (code === "no-speech") toast.error("No speech detected. Try again.");
      else if (code !== "aborted") toast.error(`Voice error: ${code}`);
    };
    recogRef.current = r;
    setListening(true);
    r.start();
  };

  const send = async (text: string) => {
    if ((!text.trim() && attachments.length === 0) || !apiKey || busy) return;

    // Build user message content — text + image parts for vision
    const hasImages = attachments.some((a) => a.type.startsWith("image/"));
    const hasDocs = attachments.some((a) => !a.type.startsWith("image/"));

    // For the display bubble, show text + attachment names
    const attachLine = attachments.length
      ? `\n\n_Attached: ${attachments.map((a) => a.name).join(", ")}_` : "";
    const displayContent = (text + attachLine).trim();

    // For the API, build a multipart content array if there are images
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let apiContent: any;
    if (hasImages) {
      // Gemini vision: content is an array of parts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = [];
      if (text.trim()) parts.push({ type: "text", text: text.trim() });
      for (const att of attachments) {
        if (att.type.startsWith("image/")) {
          // dataUrl = "data:image/jpeg;base64,<data>"
          const base64 = att.dataUrl.split(",")[1] ?? "";
          parts.push({
            type: "image_url",
            image_url: { url: `data:${att.type};base64,${base64}` },
          });
        } else {
          // Non-image: mention it as text
          parts.push({ type: "text", text: `[Attached file: ${att.name}]` });
        }
      }
      if (hasDocs && !text.trim()) {
        parts.unshift({ type: "text", text: "Please analyze the attached file(s)." });
      }
      apiContent = parts;
    } else if (hasDocs) {
      // PDF/doc — mention in text, can't send binary to Gemini via OpenAI compat
      const docNames = attachments.map((a) => a.name).join(", ");
      apiContent = `${text.trim() ? text.trim() + "\n\n" : ""}[Attached documents: ${docNames}]\nPlease note I've attached these files for context.`;
    } else {
      apiContent = text.trim();
    }

    const t = nowTime();
    const next: Msg[] = [
      ...messages,
      { role: "user", content: displayContent, time: t },
      { role: "assistant", content: "", tools: [], time: t },
    ];
    setMessages(next);
    setInput("");
    setAttachments([]);
    setBusy(true);

    // Build history for API — use display content for past messages, apiContent for current
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const historyMessages: any[] = next.slice(0, -2).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    historyMessages.push({ role: "user", content: apiContent });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, messages: historyMessages }),
      });
      if (!res.ok || !res.body) throw new Error(`Chat error ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", curEvent = "message";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith("event:")) { curEvent = line.slice(6).trim(); continue; }
          if (!line.startsWith("data:")) { if (line === "") curEvent = "message"; continue; }
          const json = line.slice(5).trim();
          if (!json) continue;
          try {
            const data = JSON.parse(json);
            if (curEvent === "token" && typeof data.token === "string") {
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role !== "assistant") return prev;
                copy[copy.length - 1] = { ...last, content: last.content + data.token, time: nowTime() };
                return copy;
              });
            } else if (curEvent === "tool_call") {
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role !== "assistant") return prev;
                copy[copy.length - 1] = { ...last, tools: [...(last.tools ?? []), { id: data.id, name: data.name, args: data.args }] };
                return copy;
              });
            } else if (curEvent === "tool_result") {
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role !== "assistant") return prev;
                copy[copy.length - 1] = { ...last, tools: (last.tools ?? []).map((t) => t.id === data.id ? { ...t, ok: data.ok, data: data.data } : t) };
                return copy;
              });
            } else if (curEvent === "error") {
              setAiError(data.error ?? "AI error");
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role !== "assistant") return prev;
                copy[copy.length - 1] = { ...last, content: `⚠️ ${data.error}`, isError: true };
                return copy;
              });
            }
          } catch { /* partial */ }
        }
      }
    } catch (err) {
      setMessages((p) => {
        const c = [...p];
        const last = c[c.length - 1];
        if (last?.role === "assistant") c[c.length - 1] = { ...last, content: `⚠️ ${err instanceof Error ? err.message : "Error"}`, isError: true };
        return c;
      });
    } finally {
      setBusy(false);
    }
  };

  const isLastAssistant = (i: number) => {
    const m = messages[i];
    return m.role === "assistant" && i === messages.length - 1 && !busy;
  };

  return (
    <div className="flex flex-col min-h-0 h-full overflow-hidden">
      {/* Error banner */}
      {aiError && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg bg-destructive/15 border border-destructive/30 px-3 py-2.5 text-xs text-destructive">
          <KeyRound className="size-3.5 mt-0.5 shrink-0" />
          <div>
            <span className="font-medium">AI error: </span>{aiError}
            {aiError.toLowerCase().includes("key") && (
              <span> — add a valid <code className="bg-destructive/10 px-1 rounded">GEMINI_API_KEY</code> to <code className="bg-destructive/10 px-1 rounded">.env</code> and restart.</span>
            )}
          </div>
          <button onClick={() => setAiError(null)} className="ml-auto shrink-0 hover:opacity-70"><X className="size-3" /></button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scroller}
        className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5 chat-scroll"
      >

        {/* Empty state — greeting + suggestion cards */}
        {messages.length === 0 && (
          <div className="space-y-5">
            {/* Greeting */}
            <div className="flex gap-3">
              <div className="size-9 rounded-xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center shrink-0">
                <Sparkles className="size-4 text-primary-foreground" />
              </div>
              <div className="glass rounded-2xl rounded-tl-sm px-4 py-3 max-w-sm">
                <div className="font-semibold text-sm">
                  Hello {userName}! 👋
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  How can I help you with your finances today?
                </div>
              </div>
            </div>

            {/* Suggestion grid */}
            <div className="grid grid-cols-2 gap-2 ml-12">
              {SUGGESTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.label}
                    onClick={() => send(`${s.label} ${s.sub}`)}
                    className="glass rounded-xl p-3 text-left hover:bg-accent/40 transition-colors flex items-start gap-2.5 group"
                  >
                    <Icon className={`size-4 mt-0.5 shrink-0 ${s.color}`} />
                    <div>
                      <div className="text-xs font-medium">{s.label}</div>
                      <div className="text-[11px] text-muted-foreground">{s.sub}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex gap-3"}>
            {/* AI avatar */}
            {m.role === "assistant" && (
              <div className="size-9 rounded-xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center shrink-0 mt-0.5">
                <Sparkles className="size-4 text-primary-foreground" />
              </div>
            )}

            <div className={m.role === "user" ? "max-w-[75%] space-y-1" : "flex-1 max-w-[85%] space-y-2"}>
              {/* User bubble */}
              {m.role === "user" && (
                <div className="rounded-2xl rounded-tr-sm bg-gradient-to-br from-primary to-primary-glow text-primary-foreground px-4 py-2.5 text-sm space-y-2">
                  {/* Show image previews if content has attachment marker */}
                  {m.content.includes("_Attached:") && (() => {
                    const [textPart] = m.content.split("\n\n_Attached:");
                    const attachedLine = m.content.match(/_Attached: (.+)_/)?.[1] ?? "";
                    return (
                      <>
                        {textPart && <div>{textPart}</div>}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {attachedLine.split(", ").map((name, ni) => (
                            <div key={ni} className="flex items-center gap-1 bg-white/10 rounded px-1.5 py-0.5 text-[11px]">
                              <Image className="size-3" />
                              <span className="max-w-[100px] truncate">{name}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                  {!m.content.includes("_Attached:") && m.content}
                </div>
              )}

              {/* Tool calls */}
              {m.role === "assistant" && (m.tools ?? []).map((t, ti) => (
                <div key={ti} className="rounded-lg bg-secondary/60 border border-border px-3 py-2 text-xs flex items-start gap-2">
                  {t.ok === undefined && <Wrench className="size-3.5 text-primary mt-0.5 animate-pulse" />}
                  {t.ok === true && <CheckCircle2 className="size-3.5 text-success mt-0.5" />}
                  {t.ok === false && <AlertCircle className="size-3.5 text-destructive mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-foreground">
                      {t.ok === undefined ? "Calling" : t.ok ? "Called" : "Failed"}{" "}
                      <span className="text-primary">{t.name}</span>
                    </span>
                    {t.args && <div className="text-muted-foreground truncate mt-0.5">{JSON.stringify(t.args)}</div>}
                  </div>
                </div>
              ))}

              {/* Assistant content */}
              {m.role === "assistant" && m.content && (
                <div className="glass rounded-2xl rounded-tl-sm px-4 py-3">
                  {m.isError ? (
                    <div className="text-sm text-destructive flex items-center gap-1.5">
                      <AlertCircle className="size-3.5 shrink-0" />{m.content}
                    </div>
                  ) : (
                    <div className="prose-chat text-sm">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              )}

              {/* Thinking indicator */}
              {m.role === "assistant" && !m.content && busy && i === messages.length - 1 && (
                <div className="glass rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}

              {/* Timestamp */}
              {m.time && (
                <div className={`text-[10px] text-muted-foreground ${m.role === "user" ? "text-right" : "ml-1"}`}>
                  {m.time}
                </div>
              )}

              {/* Action buttons below last AI message */}
              {m.role === "assistant" && m.content && !m.isError && isLastAssistant(i) && (
                <div className="flex items-center gap-1.5 flex-wrap ml-1">
                  <button className="size-7 rounded-lg bg-secondary/60 border border-border grid place-items-center hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                    <ThumbsUp className="size-3.5" />
                  </button>
                  <button className="size-7 rounded-lg bg-secondary/60 border border-border grid place-items-center hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                    <ThumbsDown className="size-3.5" />
                  </button>
                  {MSG_ACTIONS.map((a) => {
                    const Icon = a.icon;
                    return (
                      <button
                        key={a.label}
                        onClick={() => send(a.label)}
                        className="h-7 px-2.5 rounded-lg bg-secondary/60 border border-border text-[11px] flex items-center gap-1 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Icon className="size-3" /> {a.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* User avatar */}
            {m.role === "user" && (
              <div className="size-9 rounded-full bg-primary/20 grid place-items-center text-primary text-sm font-bold shrink-0 mt-0.5">
                P
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input area */}
      <div className="border-t border-border px-4 py-3 space-y-2 shrink-0">
        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1">
            {attachments.map((a, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-secondary/60 border border-border px-2 py-1.5 text-xs max-w-[180px]">
                {a.type.startsWith("image/") ? (
                  <img src={a.dataUrl} alt={a.name} className="size-8 rounded object-cover shrink-0" />
                ) : (
                  <div className="size-8 rounded bg-primary/10 grid place-items-center shrink-0">
                    <FileText className="size-4 text-primary" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{a.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {a.type.startsWith("image/") ? "Image" : "Document"}
                  </div>
                </div>
                <button type="button" onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-foreground shrink-0">
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input row */}
        <div className="flex items-center gap-2 rounded-xl bg-input/60 border border-border px-3 py-2">
          <input ref={fileRef} type="file" multiple accept="image/*,application/pdf"
            className="hidden" onChange={(e) => { onPickFiles(e.target.files); if (fileRef.current) fileRef.current.value = ""; }} />

          <button type="button" onClick={() => fileRef.current?.click()}
            title="Attach file"
            className="size-7 rounded-lg grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0">
            <Plus className="size-4" />
          </button>

          <ToolsPopover onSelectTool={() => {}} />

          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder={listening ? "Listening…" : "Ask anything about your finances…"}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />

          <button type="button" onClick={toggleMic}
            title={listening ? "Stop" : "Voice input"}
            className={`size-7 rounded-lg grid place-items-center transition-colors shrink-0 ${listening ? "text-destructive animate-pulse" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}>
            {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </button>

          <button
            onClick={() => send(input)}
            disabled={busy || (!input.trim() && attachments.length === 0) || !apiKey}
            className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-glow text-primary-foreground grid place-items-center disabled:opacity-40 hover:opacity-90 transition-opacity shrink-0">
            <Send className="size-3.5" />
          </button>
        </div>

        <div className="text-[10px] text-muted-foreground text-center">
          AI can make mistakes. Please verify important information.
        </div>
      </div>
    </div>
  );
}
