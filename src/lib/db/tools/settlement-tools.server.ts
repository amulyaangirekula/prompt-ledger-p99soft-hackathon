/**
 * Balance and settlement tools.
 * Mirrors the balance & settlement section of server.py.
 *
 * Single Responsibility: group financial balances and settlement recording.
 */

import { z } from "zod";
import { getClientForApiKey } from "../supabase.server";
import { withPendingHint, toolError } from "../pending-hint.server";
import { accumulateGroupBalances, simplifyDebts, type TransactionRow } from "../settlements.server";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const GroupBalancesSchema = z.object({
  group_id: z.string().uuid(),
  include_settlements: z.boolean().default(false),
});

const SimplifyDebtsSchema = z.object({
  group_id: z.string().uuid(),
  include_settlements: z.boolean().default(true),
});

const RecordSettlementSchema = z.object({
  group_id: z.string().uuid(),
  from_user_id: z.string().uuid(),
  to_user_id: z.string().uuid(),
  amount: z.number().positive(),
  payment_date: DateString.nullable().optional(),
  note: z.string().max(500).default(""),
});

const ListGroupSettlementsSchema = z.object({
  group_id: z.string().uuid(),
  start_date: DateString.nullable().optional(),
  end_date: DateString.nullable().optional(),
});

export async function groupBalances(
  apiKey: string,
  groupId: string,
  includeSettlements = false, // default false to avoid ambiguous column RPC bug
): Promise<Record<string, unknown>> {
  const parsed = GroupBalancesSchema.safeParse({ group_id: groupId, include_settlements: includeSettlements });
  if (!parsed.success) return { result: toolError(`Invalid input: ${parsed.error.message}`) };
  try {
    const ac = await getClientForApiKey(apiKey);
    let net: Record<string, number>;

    if (parsed.data.include_settlements) {
      // Try the RPC — may fail with ambiguous column on some DB versions
      const { data, error } = await ac.client.rpc("fn_group_balances_with_settlements", {
        p_group_id: parsed.data.group_id,
      });
      if (error) {
        // Fall back to direct calculation without settlements
        return groupBalances(apiKey, groupId, false);
      }
      net = {};
      for (const r of (data ?? []) as Array<{ user_id: string; net_balance: number }>) {
        net[r.user_id] = Number(r.net_balance);
      }
    } else {
      const { data, error } = await ac.client
        .from("transactions")
        .select("id,payer_id,amount,transaction_splits(member_id,share_amount)")
        .eq("group_id", parsed.data.group_id)
        .eq("status", "approved");
      if (error) return { result: toolError(`group_balances: ${error.message}`) };
      net = accumulateGroupBalances((data ?? []) as TransactionRow[]);
    }

    return withPendingHint({ group_id: parsed.data.group_id, net_by_user_id: net }, ac);
  } catch (e) {
    return { result: toolError(`group_balances: ${String(e)}`) };
  }
}

export async function simplifyGroupDebts(
  apiKey: string,
  groupId: string,
  includeSettlements = true,
): Promise<Record<string, unknown>> {
  const parsed = SimplifyDebtsSchema.safeParse({ group_id: groupId, include_settlements: includeSettlements });
  if (!parsed.success) return { result: toolError(`Invalid input: ${parsed.error.message}`) };
  try {
    const ac = await getClientForApiKey(apiKey);
    let net: Record<string, number>;

    if (parsed.data.include_settlements) {
      const { data, error } = await ac.client.rpc("fn_group_balances_with_settlements", {
        p_group_id: parsed.data.group_id,
      });
      if (error) return { result: toolError(`simplify_group_debts: ${error.message}`) };
      net = {};
      for (const r of (data ?? []) as Array<{ user_id: string; net_balance: number }>) {
        net[r.user_id] = Number(r.net_balance);
      }
    } else {
      const { data, error } = await ac.client
        .from("transactions")
        .select("id,payer_id,amount,transaction_splits(member_id,share_amount)")
        .eq("group_id", parsed.data.group_id)
        .eq("status", "approved");
      if (error) return { result: toolError(`simplify_group_debts: ${error.message}`) };
      net = accumulateGroupBalances((data ?? []) as TransactionRow[]);
    }

    return withPendingHint({
      group_id: parsed.data.group_id,
      net_by_user_id: net,
      suggested_transfers: simplifyDebts(net),
    }, ac);
  } catch (e) {
    return { result: toolError(`simplify_group_debts: ${String(e)}`) };
  }
}

export async function recordSettlement(
  apiKey: string,
  groupId: string,
  fromUserId: string,
  toUserId: string,
  amount: number,
  paymentDate?: string | null,
  note = "",
): Promise<Record<string, unknown>> {
  const parsed = RecordSettlementSchema.safeParse({
    group_id: groupId, from_user_id: fromUserId, to_user_id: toUserId,
    amount, payment_date: paymentDate, note,
  });
  if (!parsed.success) return { result: toolError(`Invalid input: ${parsed.error.message}`) };
  try {
    const ac = await getClientForApiKey(apiKey);
    const args: Record<string, unknown> = {
      p_group_id: parsed.data.group_id,
      p_from_user_id: parsed.data.from_user_id,
      p_to_user_id: parsed.data.to_user_id,
      p_amount: parsed.data.amount,
      p_note: parsed.data.note,
    };
    if (parsed.data.payment_date) args.p_payment_date = parsed.data.payment_date;

    const { data, error } = await ac.client.rpc("fn_record_settlement", args);
    if (error) return { result: toolError(`record_settlement: ${error.message}`) };

    return withPendingHint({
      status: "success",
      settlement_id: data as string,
      message: `Recorded: ${parsed.data.from_user_id} → ${parsed.data.to_user_id} ₹${parsed.data.amount}`,
    }, ac);
  } catch (e) {
    return { result: toolError(`record_settlement: ${String(e)}`) };
  }
}

export async function listGroupSettlements(
  apiKey: string,
  groupId: string,
  startDate?: string | null,
  endDate?: string | null,
): Promise<Record<string, unknown>> {
  const parsed = ListGroupSettlementsSchema.safeParse({ group_id: groupId, start_date: startDate, end_date: endDate });
  if (!parsed.success) return { result: toolError(`Invalid input: ${parsed.error.message}`) };
  try {
    const ac = await getClientForApiKey(apiKey);
    let q = ac.client
      .from("settlement_payments")
      .select("id,from_user_id,to_user_id,amount,payment_date,note,recorded_by,created_at")
      .eq("group_id", parsed.data.group_id);

    if (parsed.data.start_date) q = q.gte("payment_date", parsed.data.start_date);
    if (parsed.data.end_date) q = q.lte("payment_date", parsed.data.end_date);

    const { data, error } = await q.order("payment_date", { ascending: false });
    if (error) return { result: toolError(`list_group_settlements: ${error.message}`) };
    return withPendingHint(data ?? [], ac);
  } catch (e) {
    return { result: toolError(`list_group_settlements: ${String(e)}`) };
  }
}
