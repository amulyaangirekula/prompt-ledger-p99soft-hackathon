import { createFileRoute } from "@tanstack/react-router";
import { callTool, listTools, type ToolDefinition } from "@/lib/db/dispatcher.server";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
// Try models in order — fall back on 503/429
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite"];

const SYSTEM = `You are an expert AI assistant for a personal & group expense tracker.
You can call tools connected to the user's expense database via MCP.

Rules:
- All money is in INR (₹). Dates are YYYY-MM-DD.
- Be concise. Use markdown tables for lists of expenses or summaries.
- Before mutating data (add/edit/delete/approve/reject), confirm intent briefly.
- After calling tools, summarize the result in plain language.
- If the user asks "who owes me / settle up" use group_balances or simplify_group_debts.
- Today's date: ${new Date().toISOString().slice(0, 10)}.
- NEVER ask the user for a group_id, transaction_id, expense_id, or user_id. Always look them up yourself using the appropriate list tool first (e.g. call list_my_groups to find a group by name, then use its id).
- To send a group invite by email, use send_group_invite (not create_group_invite). send_group_invite takes group_id + emails and sends the email automatically.
- Tool names are exact: list_my_groups (not list_groups), send_group_invite (not send_invite), etc.`;

const ALLOWED = new Set([
  "add_expense", "list_expenses", "summarize", "edit_expense", "delete_expense", "monthly_report",
  "create_group", "list_my_groups", "create_group_invite", "send_group_invite", "redeem_group_invite", "list_group_members", "leave_group",
  "add_group_expense", "approve_group_expense", "reject_group_expense",
  "list_pending_group_expenses", "list_my_pending_approvals", "list_group_transactions",
  "delete_group_expense", "group_summary", "group_balances", "simplify_group_debts",
  "record_settlement", "list_group_settlements",
  "list_budgets", "upsert_budget", "delete_budget",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

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

function sse(data: object, event?: string) {
  const lines: string[] = [];
  if (event) lines.push(`event: ${event}`);
  lines.push(`data: ${JSON.stringify(data)}`, "", "");
  return lines.join("\n");
}

async function callGemini(
  apiKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: any[],
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ ok: true; data: any } | { ok: false; error: string; retry: boolean }> {
  for (const model of MODELS) {
    const res = await fetch(`${GEMINI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        tools: tools.length > 0 ? tools : undefined,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      return { ok: true, data: json };
    }
    if (res.status === 503 || res.status === 429 || res.status === 400) continue; // try next model
    if (res.status === 401) return { ok: false, error: "Invalid Gemini API key", retry: false };
    const errText = await res.text().catch(() => "");
    return { ok: false, error: `AI error ${res.status}: ${errText.slice(0, 200)}`, retry: false };
  }
  return { ok: false, error: "All AI models are currently overloaded — please retry in a moment", retry: true };
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) {
          return new Response(JSON.stringify({ error: "AI not configured — set GEMINI_API_KEY" }), {
            status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = await request.json();
        const mcpApiKey: string = body.apiKey ?? "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const messages: any[] = body.messages ?? [];

        if (!mcpApiKey) {
          return new Response(JSON.stringify({ error: "Missing apiKey" }), {
            status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const mcpTools = listTools();
        const openAITools = toOpenAITools(mcpTools);

        const stream = new ReadableStream({
          async start(controller) {
            const enc = new TextEncoder();
            const send = (d: object, e?: string) => controller.enqueue(enc.encode(sse(d, e)));

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const convo: any[] = [{ role: "system", content: SYSTEM }, ...messages];
            const MAX_ITER = 8;

            try {
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

                // Send any text content
                if (assistantText) {
                  send({ token: assistantText }, "token");
                }

                if (toolCalls.length === 0) {
                  // No tool calls — done
                  convo.push({ role: "assistant", content: assistantText });
                  send({}, "done");
                  break;
                }

                // Record assistant turn with tool calls
                convo.push({
                  role: "assistant",
                  content: assistantText || null,
                  tool_calls: toolCalls,
                });

                // Execute each tool
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
                // Loop — model now sees tool results
              }
            } catch (err) {
              send({ error: err instanceof Error ? err.message : "Unknown error" }, "error");
            } finally {
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
