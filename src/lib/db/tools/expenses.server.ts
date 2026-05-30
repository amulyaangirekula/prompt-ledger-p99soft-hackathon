/**
 * Personal expense tools (no group_id).
 * Mirrors the personal expense section of server.py.
 *
 * Single Responsibility: CRUD + reporting for personal transactions.
 */

import { z } from "zod";
import { getClientForApiKey } from "../supabase.server";
import { jwtSubject } from "../jwt.server";
import { withPendingHint, toolError } from "../pending-hint.server";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const AddExpenseSchema = z.object({
  date: DateString,
  amount: z.number().positive(),
  category: z.string().min(1).max(100),
  subcategory: z.string().max(100).default(""),
  note: z.string().max(500).default(""),
});

const ListExpensesSchema = z.object({
  start_date: DateString,
  end_date: DateString,
});

const SummarizeSchema = z.object({
  start_date: DateString,
  end_date: DateString,
  category: z.string().max(100).nullable().optional(),
});

const ExpenseIdSchema = z.object({
  expense_id: z.string().uuid(),
});

const EditExpenseSchema = z.object({
  expense_id: z.string().uuid(),
  date: DateString.nullable().optional(),
  amount: z.number().positive().nullable().optional(),
  category: z.string().min(1).max(100).nullable().optional(),
  subcategory: z.string().max(100).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

const MonthlyReportSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
});

export async function addExpense(
  apiKey: string,
  date: string,
  amount: number,
  category: string,
  subcategory = "",
  note = "",
): Promise<Record<string, unknown>> {
  const parsed = AddExpenseSchema.safeParse({ date, amount, category, subcategory, note });
  if (!parsed.success) return { result: toolError(`Invalid input: ${parsed.error.message}`) };
  try {
    const ac = await getClientForApiKey(apiKey);
    const uid = jwtSubject(ac.accessToken);

    const { data, error } = await ac.client.from("transactions").insert({
      submitted_by: uid,
      payer_id: uid,
      expense_date: parsed.data.date,
      amount: parsed.data.amount,
      category: parsed.data.category,
      subcategory: parsed.data.subcategory,
      note: parsed.data.note,
      status: "approved",
      group_id: null,
    }).select("id").single();

    if (error || !data) {
      return withPendingHint(toolError(`Insert failed: ${error?.message ?? "no data"}`), ac);
    }

    return withPendingHint({
      status: "success",
      id: data.id as string,
      message: "Expense added successfully",
    }, ac);
  } catch (e) {
    return { result: toolError(`Database error: ${String(e)}`) };
  }
}

export async function listExpenses(
  apiKey: string,
  startDate: string,
  endDate: string,
): Promise<Record<string, unknown>> {
  const parsed = ListExpensesSchema.safeParse({ start_date: startDate, end_date: endDate });
  if (!parsed.success) return { result: toolError(`Invalid input: ${parsed.error.message}`) };
  try {
    const ac = await getClientForApiKey(apiKey);

    const { data, error } = await ac.client
      .from("transactions")
      .select("id,expense_date,amount,category,subcategory,note,created_at,status")
      .is("group_id", null)
      .gte("expense_date", parsed.data.start_date)
      .lte("expense_date", parsed.data.end_date)
      .order("expense_date", { ascending: false });

    if (error) return { result: toolError(`Error listing expenses: ${error.message}`) };
    return withPendingHint(data ?? [], ac);
  } catch (e) {
    return { result: toolError(`Error listing expenses: ${String(e)}`) };
  }
}

export async function summarize(
  apiKey: string,
  startDate: string,
  endDate: string,
  category?: string | null,
): Promise<Record<string, unknown>> {
  const parsed = SummarizeSchema.safeParse({ start_date: startDate, end_date: endDate, category });
  if (!parsed.success) return { result: toolError(`Invalid input: ${parsed.error.message}`) };
  try {
    const ac = await getClientForApiKey(apiKey);

    let q = ac.client
      .from("transactions")
      .select("category,amount")
      .is("group_id", null)
      .gte("expense_date", parsed.data.start_date)
      .lte("expense_date", parsed.data.end_date);

    if (parsed.data.category) q = q.eq("category", parsed.data.category);

    const { data, error } = await q;
    if (error) return { result: toolError(`Error summarizing: ${error.message}`) };

    const buckets: Record<string, { total_amount: number; count: number }> = {};
    for (const row of data ?? []) {
      const cat = (row.category as string) || "Other";
      const amt = Number(row.amount) || 0;
      if (!buckets[cat]) buckets[cat] = { total_amount: 0, count: 0 };
      buckets[cat].total_amount += amt;
      buckets[cat].count += 1;
    }

    const out = Object.entries(buckets)
      .sort((a, b) => b[1].total_amount - a[1].total_amount)
      .map(([cat, v]) => ({
        category: cat,
        total_amount: Math.round(v.total_amount * 100) / 100,
        count: v.count,
      }));

    return withPendingHint(out, ac);
  } catch (e) {
    return { result: toolError(`Error summarizing: ${String(e)}`) };
  }
}

export async function deleteExpense(
  apiKey: string,
  expenseId: string,
): Promise<Record<string, unknown>> {
  const parsed = ExpenseIdSchema.safeParse({ expense_id: expenseId });
  if (!parsed.success) return { result: toolError(`Invalid input: ${parsed.error.message}`) };
  try {
    const ac = await getClientForApiKey(apiKey);
    const uid = jwtSubject(ac.accessToken);

    const { data: check } = await ac.client
      .from("transactions")
      .select("id")
      .eq("id", parsed.data.expense_id)
      .eq("submitted_by", uid)
      .is("group_id", null);

    if (!check || check.length === 0) {
      return toolError("Expense not found or you don't have permission to delete it.");
    }

    const { error } = await ac.client.from("transactions").delete().eq("id", parsed.data.expense_id);
    if (error) return { result: toolError(`Delete failed: ${error.message}`) };

    return withPendingHint({ status: "success", message: `Expense ${parsed.data.expense_id} deleted.` }, ac);
  } catch (e) {
    return { result: toolError(`Delete failed: ${String(e)}`) };
  }
}

export async function editExpense(
  apiKey: string,
  expenseId: string,
  date?: string | null,
  amount?: number | null,
  category?: string | null,
  subcategory?: string | null,
  note?: string | null,
): Promise<Record<string, unknown>> {
  const parsed = EditExpenseSchema.safeParse({ expense_id: expenseId, date, amount, category, subcategory, note });
  if (!parsed.success) return { result: toolError(`Invalid input: ${parsed.error.message}`) };
  try {
    const ac = await getClientForApiKey(apiKey);
    const uid = jwtSubject(ac.accessToken);

    const { data: check } = await ac.client
      .from("transactions")
      .select("id")
      .eq("id", parsed.data.expense_id)
      .eq("submitted_by", uid)
      .is("group_id", null);

    if (!check || check.length === 0) {
      return toolError("Expense not found or you don't have permission to edit it.");
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.date != null) updates.expense_date = parsed.data.date;
    if (parsed.data.amount != null) updates.amount = parsed.data.amount;
    if (parsed.data.category != null) updates.category = parsed.data.category;
    if (parsed.data.subcategory != null) updates.subcategory = parsed.data.subcategory;
    if (parsed.data.note != null) updates.note = parsed.data.note;

    if (Object.keys(updates).length === 0) {
      return toolError("No fields provided to update.");
    }

    const { data, error } = await ac.client
      .from("transactions")
      .update(updates)
      .eq("id", parsed.data.expense_id)
      .select()
      .single();

    if (error || !data) return toolError(`Update failed: ${error?.message ?? "no rows affected"}`);

    return withPendingHint({
      status: "success",
      message: "Expense updated successfully.",
      updated: data,
    }, ac);
  } catch (e) {
    return { result: toolError(`Edit failed: ${String(e)}`) };
  }
}

export async function monthlyReport(
  apiKey: string,
  month: number,
  year: number,
): Promise<Record<string, unknown>> {
  const parsed = MonthlyReportSchema.safeParse({ month, year });
  if (!parsed.success) return { result: toolError(`Invalid input: ${parsed.error.message}`) };
  try {
    const ac = await getClientForApiKey(apiKey);

    const lastDay = new Date(parsed.data.year, parsed.data.month, 0).getDate();
    const start = `${parsed.data.year}-${String(parsed.data.month).padStart(2, "0")}-01`;
    const end = `${parsed.data.year}-${String(parsed.data.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const { data: rows, error } = await ac.client
      .from("transactions")
      .select("id,expense_date,amount,category,subcategory,note")
      .is("group_id", null)
      .gte("expense_date", start)
      .lte("expense_date", end)
      .order("expense_date", { ascending: true });

    if (error) return { result: toolError(`monthly_report: ${error.message}`) };

    const monthName = new Date(parsed.data.year, parsed.data.month - 1, 1).toLocaleString("en-US", { month: "long" });

    if (!rows || rows.length === 0) {
      return withPendingHint({
        month: `${monthName} ${parsed.data.year}`,
        message: "No expenses recorded this month.",
        total_spent: 0,
      }, ac);
    }

    let total = 0;
    const categoryBuckets: Record<string, number> = {};
    const dailyTotals: Record<string, number> = {};
    const weekdayTotals: Record<string, number> = {
      Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0,
      Friday: 0, Saturday: 0, Sunday: 0,
    };
    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    let biggest = { amount: 0, category: "", note: "", date: "" };

    for (const r of rows) {
      const amt = Number(r.amount) || 0;
      const cat = (r.category as string) || "Other";
      const dateStr = r.expense_date as string;
      const note = (r.note as string) || "";

      total += amt;
      categoryBuckets[cat] = (categoryBuckets[cat] ?? 0) + amt;
      dailyTotals[dateStr] = (dailyTotals[dateStr] ?? 0) + amt;

      if (amt > biggest.amount) biggest = { amount: amt, category: cat, note, date: dateStr };

      try {
        const [y, m, d] = dateStr.split("-").map(Number);
        const weekday = DAYS[new Date(y, m - 1, d).getDay()];
        weekdayTotals[weekday] = (weekdayTotals[weekday] ?? 0) + amt;
      } catch { /* skip */ }
    }

    const topCategories = Object.entries(categoryBuckets)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => ({
        category: cat,
        total: Math.round(amt * 100) / 100,
        percentage: Math.round((amt / total) * 1000) / 10,
      }));

    const busiestDay = Object.entries(dailyTotals).sort((a, b) => b[1] - a[1])[0];
    const weekend = (weekdayTotals.Saturday ?? 0) + (weekdayTotals.Sunday ?? 0);
    const weekday = total - weekend;

    return withPendingHint({
      month: `${monthName} ${parsed.data.year}`,
      total_spent: Math.round(total * 100) / 100,
      transaction_count: rows.length,
      top_categories: topCategories,
      biggest_expense: {
        amount: Math.round(biggest.amount * 100) / 100,
        category: biggest.category,
        note: biggest.note,
        date: biggest.date,
      },
      busiest_day: {
        date: busiestDay?.[0] ?? null,
        total: Math.round((busiestDay?.[1] ?? 0) * 100) / 100,
      },
      weekday_vs_weekend: {
        weekdays_total: Math.round(weekday * 100) / 100,
        weekends_total: Math.round(weekend * 100) / 100,
        weekend_percentage: total > 0 ? Math.round((weekend / total) * 1000) / 10 : 0,
      },
      daily_totals: Object.entries(dailyTotals)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, t]) => ({ date, total: Math.round(t * 100) / 100 })),
    }, ac);
  } catch (e) {
    return { result: toolError(`monthly_report: ${String(e)}`) };
  }
}
