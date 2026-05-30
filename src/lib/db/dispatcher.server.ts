/**
 * Tool dispatcher — routes tool name + args to the correct handler.
 *
 * This replaces the MCP HTTP client entirely. Instead of sending JSON-RPC
 * requests to the Render-deployed FastMCP server, we call TypeScript
 * functions directly in the same process.
 *
 * Open/Closed Principle: add new tools by registering them in TOOL_REGISTRY.
 * Interface Segregation: callers only need callTool() and listTools().
 */

import { registerNewUser, loginGetApiKey } from "./tools/auth.server";
import {
  addExpense, listExpenses, summarize,
  deleteExpense, editExpense, monthlyReport,
} from "./tools/expenses.server";
import {
  createGroup, listMyGroups, createGroupInvite,
  redeemGroupInvite, listGroupMembers, leaveGroup, sendGroupInvite,
} from "./tools/groups.server";
import {
  addGroupExpense, approveGroupExpense, rejectGroupExpense,
  listPendingGroupExpenses, listMyPendingApprovals,
  listGroupTransactions, deleteGroupExpense, groupSummary,
} from "./tools/group-expenses.server";
import {
  groupBalances, simplifyGroupDebts,
  recordSettlement, listGroupSettlements,
} from "./tools/settlement-tools.server";
import { listBudgets, upsertBudget, deleteBudget } from "./tools/budgets.server";
import CATEGORIES from "./categories";

// ---------------------------------------------------------------------------
// Tool metadata (used by the AI to understand available tools)
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  // Auth
  {
    name: "register_new_user",
    description: "🆕 Register a new account. Returns an API key.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string" },
        password: { type: "string", description: "Min 8 characters." },
        full_name: { type: "string", default: "" },
      },
      required: ["email", "password"],
    },
  },
  {
    name: "login_get_api_key",
    description: "🔑 Get your API key by signing in.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string" },
        password: { type: "string" },
      },
      required: ["email", "password"],
    },
  },
  // Personal expenses
  {
    name: "add_expense",
    description: "Add a personal expense (no group). Amount in INR. Date format: YYYY-MM-DD.",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        date: { type: "string" },
        amount: { type: "number" },
        category: { type: "string" },
        subcategory: { type: "string", default: "" },
        note: { type: "string", default: "" },
      },
      required: ["api_key", "date", "amount", "category"],
    },
  },
  {
    name: "list_expenses",
    description: "List personal expenses in an inclusive date range (YYYY-MM-DD).",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        start_date: { type: "string" },
        end_date: { type: "string" },
      },
      required: ["api_key", "start_date", "end_date"],
    },
  },
  {
    name: "summarize",
    description: "Personal spending totals by category for a date range.",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        start_date: { type: "string" },
        end_date: { type: "string" },
        category: { anyOf: [{ type: "string" }, { type: "null" }], default: null },
      },
      required: ["api_key", "start_date", "end_date"],
    },
  },
  {
    name: "delete_expense",
    description: "Delete a personal expense by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        expense_id: { type: "string" },
      },
      required: ["api_key", "expense_id"],
    },
  },
  {
    name: "edit_expense",
    description: "Edit a personal expense. Only pass the fields you want to change.",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        expense_id: { type: "string" },
        date: { anyOf: [{ type: "string" }, { type: "null" }], default: null },
        amount: { anyOf: [{ type: "number" }, { type: "null" }], default: null },
        category: { anyOf: [{ type: "string" }, { type: "null" }], default: null },
        subcategory: { anyOf: [{ type: "string" }, { type: "null" }], default: null },
        note: { anyOf: [{ type: "string" }, { type: "null" }], default: null },
      },
      required: ["api_key", "expense_id"],
    },
  },
  {
    name: "monthly_report",
    description: "Full spending report for a given month with category breakdown and trends.",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        month: { type: "integer", description: "Month number (1-12)." },
        year: { type: "integer", description: "Four-digit year e.g. 2026." },
      },
      required: ["api_key", "month", "year"],
    },
  },
  // Groups
  {
    name: "create_group",
    description: "Create a group. kind: trip | family | team | personal_mirror.",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        name: { type: "string" },
        kind: { type: "string", default: "trip" },
      },
      required: ["api_key", "name"],
    },
  },
  {
    name: "list_my_groups",
    description: "List all groups the signed-in user belongs to.",
    inputSchema: {
      type: "object",
      properties: { api_key: { type: "string" } },
      required: ["api_key"],
    },
  },
  {
    name: "create_group_invite",
    description: "Generate an invite code for a group.",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        group_id: { type: "string" },
        expires_in_days: { type: "integer", default: 7 },
      },
      required: ["api_key", "group_id"],
    },
  },
  {
    name: "send_group_invite",
    description: "Generate an invite code and send it via email to one or more people. Accepts a single email or comma-separated list.",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        group_id: { type: "string" },
        emails: {
          anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
          description: "Single email or array of emails to invite.",
        },
        expires_in_days: { type: "integer", default: 7 },
      },
      required: ["api_key", "group_id", "emails"],
    },
  },
  {
    name: "redeem_group_invite",
    description: "Join a group using an invite code.",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        invite_code: { type: "string" },
      },
      required: ["api_key", "invite_code"],
    },
  },
  {
    name: "list_group_members",
    description: "List members of a group with their roles.",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        group_id: { type: "string" },
      },
      required: ["api_key", "group_id"],
    },
  },
  {
    name: "leave_group",
    description: "Leave a group.",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        group_id: { type: "string" },
      },
      required: ["api_key", "group_id"],
    },
  },
  // Group expenses
  {
    name: "add_group_expense",
    description: "Add a shared expense split equally among all members. Status starts as pending.",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        group_id: { type: "string" },
        expense_date: { type: "string" },
        amount: { type: "number" },
        category: { type: "string" },
        subcategory: { type: "string", default: "" },
        note: { type: "string", default: "" },
        payer_user_id: { anyOf: [{ type: "string" }, { type: "null" }], default: null },
      },
      required: ["api_key", "group_id", "expense_date", "amount", "category"],
    },
  },
  {
    name: "approve_group_expense",
    description: "Approve a pending group expense.",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        transaction_id: { type: "string" },
      },
      required: ["api_key", "transaction_id"],
    },
  },
  {
    name: "reject_group_expense",
    description: "Reject a pending group expense (finalises as rejected immediately).",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        transaction_id: { type: "string" },
      },
      required: ["api_key", "transaction_id"],
    },
  },
  {
    name: "list_pending_group_expenses",
    description: "List all pending expenses for a group.",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        group_id: { type: "string" },
      },
      required: ["api_key", "group_id"],
    },
  },
  {
    name: "list_my_pending_approvals",
    description: "List all group expenses waiting for your approval.",
    inputSchema: {
      type: "object",
      properties: { api_key: { type: "string" } },
      required: ["api_key"],
    },
  },
  {
    name: "list_group_transactions",
    description: "List all transactions for a group, optionally filtered by date range.",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        group_id: { type: "string" },
        start_date: { anyOf: [{ type: "string" }, { type: "null" }], default: null },
        end_date: { anyOf: [{ type: "string" }, { type: "null" }], default: null },
      },
      required: ["api_key", "group_id"],
    },
  },
  {
    name: "delete_group_expense",
    description: "Delete a pending group expense (only submitter, only while pending).",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        transaction_id: { type: "string" },
      },
      required: ["api_key", "transaction_id"],
    },
  },
  {
    name: "group_summary",
    description: "Spending breakdown for a group by category (approved expenses only).",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        group_id: { type: "string" },
        start_date: { anyOf: [{ type: "string" }, { type: "null" }], default: null },
        end_date: { anyOf: [{ type: "string" }, { type: "null" }], default: null },
      },
      required: ["api_key", "group_id"],
    },
  },
  // Balances & settlements
  {
    name: "group_balances",
    description: "Per-member net balance in INR. Positive = others owe them.",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        group_id: { type: "string" },
        include_settlements: { type: "boolean", default: true },
      },
      required: ["api_key", "group_id"],
    },
  },
  {
    name: "simplify_group_debts",
    description: "Suggest the minimum set of transfers to fully settle the group.",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        group_id: { type: "string" },
        include_settlements: { type: "boolean", default: true },
      },
      required: ["api_key", "group_id"],
    },
  },
  {
    name: "record_settlement",
    description: "Record a real payment between members (UPI, cash, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        group_id: { type: "string" },
        from_user_id: { type: "string" },
        to_user_id: { type: "string" },
        amount: { type: "number" },
        payment_date: { anyOf: [{ type: "string" }, { type: "null" }], default: null },
        note: { type: "string", default: "" },
      },
      required: ["api_key", "group_id", "from_user_id", "to_user_id", "amount"],
    },
  },
  {
    name: "list_group_settlements",
    description: "List recorded settlement payments for a group.",
    inputSchema: {
      type: "object",
      properties: {
        api_key: { type: "string" },
        group_id: { type: "string" },
        start_date: { anyOf: [{ type: "string" }, { type: "null" }], default: null },
        end_date: { anyOf: [{ type: "string" }, { type: "null" }], default: null },
      },
      required: ["api_key", "group_id"],
    },
  },
  // Budgets
  {
    name: "list_budgets",
    description: "List all active budgets for the current user with live actual spend for the current period.",
    inputSchema: {
      type: "object",
      properties: { api_key: { type: "string" } },
      required: ["api_key"],
    },
  },
  {
    name: "upsert_budget",
    description: "Create a new budget (omit id) or update an existing one (pass id). Amount in INR.",
    inputSchema: {
      type: "object",
      properties: {
        api_key:      { type: "string" },
        id:           { anyOf: [{ type: "string" }, { type: "null" }], default: null, description: "Omit to create, pass UUID to update." },
        name:         { type: "string" },
        budget_type:  { type: "string", enum: ["personal", "category", "group"], default: "personal" },
        category:     { anyOf: [{ type: "string" }, { type: "null" }], default: null },
        group_id:     { anyOf: [{ type: "string" }, { type: "null" }], default: null },
        amount:       { type: "number" },
        period:       { type: "string", enum: ["monthly", "weekly", "yearly", "custom"], default: "monthly" },
        period_start: { anyOf: [{ type: "string" }, { type: "null" }], default: null },
        period_end:   { anyOf: [{ type: "string" }, { type: "null" }], default: null },
        emoji:        { type: "string", default: "💰" },
        color:        { type: "string", default: "#a78bfa" },
      },
      required: ["api_key", "name", "amount"],
    },
  },
  {
    name: "delete_budget",
    description: "Delete (soft-delete) a budget by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        api_key:   { type: "string" },
        budget_id: { type: "string" },
      },
      required: ["api_key", "budget_id"],
    },
  },
];

// ---------------------------------------------------------------------------
// Outcome type (same interface as the old MCP client)
// ---------------------------------------------------------------------------

export type ToolCallOutcome =
  | { ok: true; data: unknown; isError: false }
  | { ok: false; error: string; isError: true };

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = Record<string, any>;

function unwrap(raw: Record<string, unknown>): ToolCallOutcome {
  // Every tool returns { result: <data>, pending_approvals_summary?: {...} }
  // or { status: "error", message: "..." } for auth tools
  const data = "result" in raw ? raw.result : raw;

  if (
    data &&
    typeof data === "object" &&
    (data as Record<string, unknown>).status === "error"
  ) {
    return {
      ok: false,
      error: String((data as Record<string, unknown>).message ?? "Tool error"),
      isError: true,
    };
  }

  return { ok: true, data, isError: false };
}

/**
 * Dispatch a tool call by name. Mirrors callMcpTool() interface exactly.
 * api_key is injected by the caller (mcp.functions.ts) — not passed by the browser.
 */
export async function callTool(
  apiKey: string,
  name: string,
  args: Args,
): Promise<ToolCallOutcome> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let raw: Record<string, any>;

    switch (name) {
      // Auth (no api_key)
      case "register_new_user":
        raw = await registerNewUser(args.email, args.password, args.full_name);
        break;
      case "login_get_api_key":
        raw = await loginGetApiKey(args.email, args.password);
        break;

      // Personal expenses
      case "add_expense":
        raw = await addExpense(apiKey, args.date, args.amount, args.category, args.subcategory, args.note);
        break;
      case "list_expenses":
        raw = await listExpenses(apiKey, args.start_date, args.end_date);
        break;
      case "summarize":
        raw = await summarize(apiKey, args.start_date, args.end_date, args.category);
        break;
      case "delete_expense":
        raw = await deleteExpense(apiKey, args.expense_id);
        break;
      case "edit_expense":
        raw = await editExpense(apiKey, args.expense_id, args.date, args.amount, args.category, args.subcategory, args.note);
        break;
      case "monthly_report":
        raw = await monthlyReport(apiKey, args.month, args.year);
        break;

      // Groups
      case "create_group":
        raw = await createGroup(apiKey, args.name, args.kind);
        break;
      case "list_my_groups":
        raw = await listMyGroups(apiKey);
        break;
      case "create_group_invite":
        raw = await createGroupInvite(apiKey, args.group_id, args.expires_in_days);
        break;
      case "send_group_invite":
        raw = await sendGroupInvite(apiKey, args.group_id, args.emails, args.expires_in_days);
        break;
      case "redeem_group_invite":
        raw = await redeemGroupInvite(apiKey, args.invite_code);
        break;
      case "list_group_members":
        raw = await listGroupMembers(apiKey, args.group_id);
        break;
      case "leave_group":
        raw = await leaveGroup(apiKey, args.group_id);
        break;

      // Group expenses
      case "add_group_expense":
        raw = await addGroupExpense(apiKey, args.group_id, args.expense_date, args.amount, args.category, args.subcategory, args.note, args.payer_user_id);
        break;
      case "approve_group_expense":
        raw = await approveGroupExpense(apiKey, args.transaction_id);
        break;
      case "reject_group_expense":
        raw = await rejectGroupExpense(apiKey, args.transaction_id);
        break;
      case "list_pending_group_expenses":
        raw = await listPendingGroupExpenses(apiKey, args.group_id);
        break;
      case "list_my_pending_approvals":
        raw = await listMyPendingApprovals(apiKey);
        break;
      case "list_group_transactions":
        raw = await listGroupTransactions(apiKey, args.group_id, args.start_date, args.end_date);
        break;
      case "delete_group_expense":
        raw = await deleteGroupExpense(apiKey, args.transaction_id);
        break;
      case "group_summary":
        raw = await groupSummary(apiKey, args.group_id, args.start_date, args.end_date);
        break;

      // Balances & settlements
      case "group_balances":
        raw = await groupBalances(apiKey, args.group_id, args.include_settlements);
        break;
      case "simplify_group_debts":
        raw = await simplifyGroupDebts(apiKey, args.group_id, args.include_settlements);
        break;
      case "record_settlement":
        raw = await recordSettlement(apiKey, args.group_id, args.from_user_id, args.to_user_id, args.amount, args.payment_date, args.note);
        break;
      case "list_group_settlements":
        raw = await listGroupSettlements(apiKey, args.group_id, args.start_date, args.end_date);
        break;

      // Budgets
      case "list_budgets":
        raw = await listBudgets(apiKey);
        break;
      case "upsert_budget":
        raw = await upsertBudget(apiKey, args);
        break;
      case "delete_budget":
        raw = await deleteBudget(apiKey, args.budget_id);
        break;

      // Categories resource
      case "get_categories":
        return { ok: true, data: CATEGORIES, isError: false };

      default:
        return { ok: false, error: `Unknown tool: '${name}'`, isError: true };
    }

    return unwrap(raw);
  } catch (e) {
    return { ok: false, error: String(e), isError: true };
  }
}

/** List all available tools (used by the AI to know what it can call). */
export function listTools(): ToolDefinition[] {
  return TOOL_DEFINITIONS;
}
