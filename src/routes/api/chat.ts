/**
 * /api/chat — Streaming AI chat endpoint.
 *
 * Pipeline:
 *   1. Intent classification  — is this a tool call, analytics query, or chitchat?
 *   2. Memory injection       — last MEMORY_TURNS turns from MongoDB thread
 *   3. Gemini agentic loop    — MAX_ITER rounds of tool calling
 *   4. Thread persistence     — append user+assistant pair to MongoDB
 *
 * SSE events emitted:
 *   token        { token: string }
 *   tool_call    { id, name, args }
 *   tool_result  { id, name, ok, data }
 *   intent       { type: "tool" | "analytics" | "chitchat" }
 *   done         {}
 *   error        { error: string }
 */

import { createFileRoute } from "@tanstack/react-router";
import { callTool, listTools, type ToolDefinition } from "@/lib/db/dispatcher.server";
import { getClientForApiKey } from "@/lib/db/supabase.server";
import { jwtPayload } from "@/lib/db/jwt.server";
import { appendMessages, getMemoryContext, MEMORY_TURNS } from "@/lib/db/threads.server";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite"];
const MAX_ITER = 8;

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const BASE_SYSTEM = `You are an expert AI assistant for PromptLedger — a personal & group expense tracker.
You have access to MCP tools connected to the user's expense database.

Rules:
- All money is in INR (₹). Dates are YYYY-MM-DD.
- Be concise. Use markdown tables for lists of expenses or summaries.
- Before mutating data (add/edit/delete/approve/reject), confirm intent briefly.
- After calling tools, summarize the result clearly in plain language.
- If the user asks "who owes me / settle up", use group_balances or simplify_group_debts.
- NEVER ask the user for a group_id, transaction_id, expense_id, or user_id — look them up first.
- To send a group invite by email, use send_group_invite (not create_group_invite).
- Tool names are exact: list_my_groups, send_group_invite, etc.
- If NO standard tool can answer the question (e.g. day-of-week patterns, per-member rankings,
  recurring habits, weekend spending, custom cross-table queries), call no_tool_match with the
  user's question as input_text. NEVER tell the user you cannot answer — use no_tool_match first.
- Today's date: ${new Date().toISOString().slice(0, 10)}.`;

const INTENT_SYSTEM = `You are an intent classifier for an expense tracker AI assistant.
Classify the user's message into exactly one of three categories:

- "tool" → Can be fully answered using one of these standard tools:
  add/edit/delete/list personal expenses, monthly report, summarize by category,
  create/list/join groups, add/approve/reject group expenses, group balances,
  simplify debts, record settlement, list settlements, list/create/delete budgets.
  Use "tool" ONLY when a standard tool can answer completely without custom SQL.

- "analytics" → Needs custom data analysis that standard tools cannot do. Use this for:
  • Day-of-week or time patterns (weekend spending, Friday nights, peak hours)
  • Cross-month or multi-period comparisons (month-over-month trends)
  • Per-member breakdowns within a group (who spent most on food in Goa trip)
  • Recurring patterns, streaks, or habit detection
  • Correlations or rankings not supported by existing tools
  • Any question containing: "recurring", "pattern", "trend", "weekday", "weekend",
    "most frequent", "highest", "rank", "compare across", "over time", "by day/week"

- "chitchat" → General conversation, greetings, or non-finance questions.

When in doubt between "tool" and "analytics", prefer "analytics".

Respond with ONLY a JSON object: { "intent": "tool" | "analytics" | "chitchat" }`;

// ---------------------------------------------------------------------------
// Allowed tools for the agentic loop
// ---------------------------------------------------------------------------

const ALLOWED = new Set([
  "add_expense", "list_expenses", "summarize", "edit_expense", "delete_expense", "monthly_report",
  "create_group", "list_my_groups", "create_group_invite", "send_group_invite",
  "redeem_group_invite", "list_group_members", "leave_group",
  "add_group_expense", "approve_group_expense", "reject_group_expense",
  "list_pending_group_expenses", "list_my_pending_approvals", "list_group_transactions",
  "delete_group_expense", "group_summary", "group_balances", "simplify_group_debts",
  "record_settlement", "list_group_settlements",
  "list_budgets", "upsert_budget", "delete_budget",
  // no_tool_match available as fallback when no standard tool fits
  "no_tool_match",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toOpenAITools(tools: ToolDefinition[]) {
  return tools
    .filter((t) => ALLOWED.has(t.name))
    .map((t) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schema: any = t.inputSchema ?? { type: "object", properties: {} };
      const properties = { ...(schema.properties ?? {}) };
      delete properties.api_key;
      const required = (schema.required ?? []).filter((r: string) => r !== "api_key");
      return {
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description ?? "",
          parameters: { type: "object", properties, required, additionalProperties: false },
        },
      };
    });
}

function sse(data: object, event?: string): string {
  const lines: string[] = [];
  if (event) lines.push(`event: ${event}`);
  lines.push(`data: ${JSON.stringify(data)}`, "", "");
  return lines.join("\n");
}

async function callGemini(
  geminiKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: any[],
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  for (const model of MODELS) {
    const res = await fetch(`${GEMINI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${geminiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        tools: tools.length > 0 ? tools : undefined,
      }),
    });

    if (res.ok) return { ok: true, data: await res.json() };

    if (res.status === 429 || res.status === 503 || res.status === 400) {
      const errText = await res.text().catch(() => "");
      console.log(`[${model}] ${res.status}:`, errText.slice(0, 200));
      continue;
    }
    if (res.status === 401) return { ok: false, error: "Invalid Gemini API key" };

    const errText = await res.text().catch(() => "");
    return { ok: false, error: `Gemini error ${res.status}: ${errText.slice(0, 200)}` };
  }
  return { ok: false, error: "All AI models overloaded — please retry in a moment" };
}

/**
 * Classify the user's intent with a single fast Gemini call.
 * Returns "tool" | "analytics" | "chitchat".
 * Falls back to "tool" on any error so the main loop still runs.
 */
async function classifyIntent(
  geminiKey: string,
  userMessage: string,
): Promise<"tool" | "analytics" | "chitchat"> {
  try {
    const res = await fetch(`${GEMINI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${geminiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-2.0-flash-lite", // smallest/cheapest for classification
        max_tokens: 20,
        messages: [
          { role: "system", content: INTENT_SYSTEM },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!res.ok) return "tool"; // safe fallback

    const json = await res.json() as { choices: Array<{ message: { content: string } }> };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? "";

    // Parse { "intent": "..." } — be lenient about extra whitespace/markdown
    const match = raw.match(/"intent"\s*:\s*"(tool|analytics|chitchat)"/);
    if (match) return match[1] as "tool" | "analytics" | "chitchat";
  } catch {
    // silent — fallback below
  }
  return "tool";
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) {
          return new Response(
            JSON.stringify({ error: "AI not configured — set GEMINI_API_KEY in .env" }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json();
        const mcpApiKey: string = body.apiKey ?? "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const clientMessages: any[] = body.messages ?? [];
        const threadId: string = body.threadId ?? "";

        if (!mcpApiKey) {
          return new Response(JSON.stringify({ error: "Missing apiKey" }), {
            status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        // Extract the latest user message (last item in clientMessages)
        const latestUserMessage: string =
          clientMessages.length > 0
            ? (clientMessages[clientMessages.length - 1]?.content ?? "")
            : "";

        const mcpTools = listTools();
        const openAITools = toOpenAITools(mcpTools);

        const stream = new ReadableStream({
          async start(controller) {
            const enc = new TextEncoder();
            const send = (d: object, e?: string) =>
              controller.enqueue(enc.encode(sse(d, e)));

            let finalAssistantContent = "";

            try {
              // -------------------------------------------------------
              // Step 1: Classify intent
              // -------------------------------------------------------
              const intent = await classifyIntent(GEMINI_API_KEY, latestUserMessage);
              send({ type: intent }, "intent");

              // -------------------------------------------------------
              // Step 2: Inject memory context from MongoDB
              // -------------------------------------------------------
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let memoryMessages: any[] = [];
              if (threadId && mcpApiKey) {
                try {
                  const ac = await getClientForApiKey(mcpApiKey);
                  const claims = jwtPayload(ac.accessToken);
                  const userId = claims.sub as string;
                  memoryMessages = await getMemoryContext(threadId, userId, MEMORY_TURNS);
                } catch {
                  // Memory load failure is non-fatal — continue without it
                }
              }

              // -------------------------------------------------------
              // Step 3: Analytics path — route directly to SQL agent
              // -------------------------------------------------------
              if (intent === "analytics") {
                send(
                  { id: "sql-agent", name: "no_tool_match", args: { input_text: latestUserMessage } },
                  "tool_call",
                );

                const result = await callTool(mcpApiKey, "no_tool_match", {
                  input_text: latestUserMessage,
                });

                send(
                  { id: "sql-agent", name: "no_tool_match", ok: result.ok, data: result.ok ? result.data : result.error },
                  "tool_result",
                );

                // Ask Gemini to format the raw SQL results into a readable answer
                if (result.ok) {
                  const formatResult = await callGemini(
                    GEMINI_API_KEY,
                    [
                      { role: "system", content: BASE_SYSTEM },
                      ...memoryMessages,
                      { role: "user", content: latestUserMessage },
                      {
                        role: "assistant",
                        content: null,
                        tool_calls: [{
                          id: "sql-agent",
                          type: "function",
                          function: { name: "no_tool_match", arguments: JSON.stringify({ input_text: latestUserMessage }) },
                        }],
                      },
                      {
                        role: "tool",
                        tool_call_id: "sql-agent",
                        content: JSON.stringify(result.data),
                      },
                    ],
                    [], // no tools — just formatting
                  );

                  if (formatResult.ok) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const msg = formatResult.data?.choices?.[0]?.message as any;
                    finalAssistantContent = msg?.content ?? "";
                    if (finalAssistantContent) send({ token: finalAssistantContent }, "token");
                  } else {
                    // Fallback: dump raw data
                    finalAssistantContent = `Here are the results:\n\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``;
                    send({ token: finalAssistantContent }, "token");
                  }
                } else {
                  finalAssistantContent = `⚠️ ${result.error}`;
                  send({ token: finalAssistantContent }, "token");
                }

                send({}, "done");
                return;
              }

              // -------------------------------------------------------
              // Step 4: Chitchat path — no tools, direct response
              // -------------------------------------------------------
              if (intent === "chitchat") {
                const chatResult = await callGemini(
                  GEMINI_API_KEY,
                  [
                    { role: "system", content: BASE_SYSTEM },
                    ...memoryMessages,
                    ...clientMessages,
                  ],
                  [], // no tools for chitchat
                );

                if (!chatResult.ok) {
                  send({ error: chatResult.error }, "error");
                  return;
                }

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const msg = chatResult.data?.choices?.[0]?.message as any;
                finalAssistantContent = msg?.content ?? "";
                if (finalAssistantContent) send({ token: finalAssistantContent }, "token");
                send({}, "done");
                return;
              }

              // -------------------------------------------------------
              // Step 5: Tool path — agentic loop
              // -------------------------------------------------------
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const convo: any[] = [
                { role: "system", content: BASE_SYSTEM },
                ...memoryMessages,
                ...clientMessages,
              ];

              for (let iter = 0; iter < MAX_ITER; iter++) {
                const aiResult = await callGemini(GEMINI_API_KEY, convo, openAITools);

                if (!aiResult.ok) {
                  send({ error: aiResult.error }, "error");
                  break;
                }

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const message = aiResult.data?.choices?.[0]?.message as any;
                if (!message) {
                  send({ error: "Empty response from AI" }, "error");
                  break;
                }

                const assistantText: string = message.content ?? "";
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const toolCalls: any[] = message.tool_calls ?? [];

                if (assistantText) {
                  finalAssistantContent += assistantText;
                  send({ token: assistantText }, "token");
                }

                if (toolCalls.length === 0) {
                  convo.push({ role: "assistant", content: assistantText });
                  send({}, "done");
                  break;
                }

                convo.push({
                  role: "assistant",
                  content: assistantText || null,
                  tool_calls: toolCalls,
                });

                for (const tc of toolCalls) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  let args: any = {};
                  try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { /* noop */ }

                  const toolName: string = tc.function?.name ?? "";
                  send({ id: tc.id, name: toolName, args }, "tool_call");

                  const result = await callTool(mcpApiKey, toolName, args);
                  send({
                    id: tc.id,
                    name: toolName,
                    ok: result.ok,
                    data: result.ok ? result.data : result.error,
                  }, "tool_result");

                  convo.push({
                    role: "tool",
                    tool_call_id: tc.id,
                    content: JSON.stringify(result.ok ? result.data : { error: result.error }),
                  });
                }
              }

            } catch (err) {
              send({ error: err instanceof Error ? err.message : "Unknown error" }, "error");
            } finally {
              // -------------------------------------------------------
              // Step 6: Persist to MongoDB (fire-and-forget — never block the stream)
              // -------------------------------------------------------
              if (threadId && latestUserMessage && finalAssistantContent) {
                try {
                  const ac = await getClientForApiKey(mcpApiKey);
                  const claims = jwtPayload(ac.accessToken);
                  const userId = claims.sub as string;
                  await appendMessages(threadId, userId, latestUserMessage, finalAssistantContent);
                } catch (e) {
                  // Non-fatal — log but don't surface to user
                  console.warn("[chat] Thread persistence failed:", e);
                }
              }
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            ...corsHeaders,
          },
        });
      },
    },
  },
});
