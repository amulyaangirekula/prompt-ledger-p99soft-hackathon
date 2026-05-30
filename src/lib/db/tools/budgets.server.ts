/**
 * Budget tools — list, create/update, delete.
 * Backed by the budgets table + fn_list_budgets / fn_upsert_budget / fn_delete_budget RPCs.
 *
 * Single Responsibility: budget CRUD with live spend calculation.
 */

import { z } from "zod";
import { getClientForApiKey } from "../supabase.server";
import { withPendingHint, toolError } from "../pending-hint.server";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const UpsertBudgetSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(100),
  budget_type: z.enum(["personal", "category", "group"]).default("personal"),
  category: z.string().max(100).nullable().optional(),
  group_id: z.string().uuid().nullable().optional(),
  amount: z.number().positive(),
  period: z.enum(["monthly", "weekly", "yearly", "custom"]).default("monthly"),
  period_start: DateString.nullable().optional(),
  period_end: DateString.nullable().optional(),
  emoji: z.string().max(10).default("💰"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex code like #a78bfa").default("#a78bfa"),
});

const DeleteBudgetSchema = z.object({
  budget_id: z.string().uuid(),
});

export async function listBudgets(apiKey: string): Promise<Record<string, unknown>> {
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client.rpc("fn_list_budgets");
    if (error) return { result: toolError(`list_budgets: ${error.message}`) };
    return withPendingHint(data ?? [], ac);
  } catch (e) {
    return { result: toolError(`list_budgets: ${String(e)}`) };
  }
}

export async function upsertBudget(
  apiKey: string,
  args: {
    id?: string | null;
    name: string;
    budget_type?: string;
    category?: string | null;
    group_id?: string | null;
    amount: number;
    period?: string;
    period_start?: string | null;
    period_end?: string | null;
    emoji?: string;
    color?: string;
  },
): Promise<Record<string, unknown>> {
  const parsed = UpsertBudgetSchema.safeParse(args);
  if (!parsed.success) return { result: toolError(`Invalid input: ${parsed.error.message}`) };
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client.rpc("fn_upsert_budget", {
      p_id:           parsed.data.id ?? null,
      p_name:         parsed.data.name,
      p_budget_type:  parsed.data.budget_type,
      p_category:     parsed.data.category ?? null,
      p_group_id:     parsed.data.group_id ?? null,
      p_amount:       parsed.data.amount,
      p_period:       parsed.data.period,
      p_period_start: parsed.data.period_start ?? null,
      p_period_end:   parsed.data.period_end ?? null,
      p_emoji:        parsed.data.emoji,
      p_color:        parsed.data.color,
    });
    if (error) return { result: toolError(`upsert_budget: ${error.message}`) };
    return withPendingHint({
      status: "success",
      id: data as string,
      message: parsed.data.id ? "Budget updated" : "Budget created",
    }, ac);
  } catch (e) {
    return { result: toolError(`upsert_budget: ${String(e)}`) };
  }
}

export async function deleteBudget(
  apiKey: string,
  budgetId: string,
): Promise<Record<string, unknown>> {
  const parsed = DeleteBudgetSchema.safeParse({ budget_id: budgetId });
  if (!parsed.success) return { result: toolError(`Invalid input: ${parsed.error.message}`) };
  try {
    const ac = await getClientForApiKey(apiKey);
    const { data, error } = await ac.client.rpc("fn_delete_budget", { p_id: parsed.data.budget_id });
    if (error) return { result: toolError(`delete_budget: ${error.message}`) };
    return withPendingHint(
      typeof data === "object" && data !== null ? data : { status: "success" },
      ac,
    );
  } catch (e) {
    return { result: toolError(`delete_budget: ${String(e)}`) };
  }
}
