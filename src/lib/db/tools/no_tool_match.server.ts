/**
 * SQL Agent — fallback for analytics queries that no structured tool covers.
 *
 * Pipeline:
 *   1. Fetch DB schema (cached in-process, 10 min TTL)
 *   2. Ask Gemini to generate a read-only SELECT
 *   3. Validate SQL (whitelist SELECT/WITH, blocklist destructive ops + sensitive tables)
 *   4. Execute via exec_sql RPC (Supabase security-definer, SELECT-only)
 *   5. Return rows + the generated SQL so the UI can show it
 *
 * Uses GEMINI_API_KEY — no separate Groq key needed.
 */

import { getClientForApiKey } from "../supabase.server";
import { jwtPayload } from "../jwt.server";
import { toolError } from "../pending-hint.server";

// ---------------------------------------------------------------------------
// Schema cache — avoids 3 SQL round-trips on every analytics query
// ---------------------------------------------------------------------------

interface SchemaCache {
  schema: string;
  fetchedAt: number;
}

const SCHEMA_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let schemaCache: SchemaCache | null = null;

// ---------------------------------------------------------------------------
// SQL safety
// ---------------------------------------------------------------------------

const DESTRUCTIVE_OPS = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|EXECUTE|CALL|DO|COPY)\b/i;

/** Tables the AI must never read — sensitive auth/billing data */
const BLOCKED_TABLES = ["api_keys", "users", "auth", "pg_catalog", "information_schema"];

function isSafeSql(sql: string): { safe: boolean; reason?: string } {
  const trimmed = sql.trim().toUpperCase();

  // Must start with SELECT or WITH (CTE)
  if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("WITH")) {
    return { safe: false, reason: "Query must start with SELECT or WITH" };
  }

  // Must have FROM (catches "SELECT 1" type injections that skip data)
  if (!trimmed.includes("FROM")) {
    return { safe: false, reason: "Query must include FROM clause" };
  }

  // Reject any destructive keywords
  if (DESTRUCTIVE_OPS.test(sql)) {
    return { safe: false, reason: "Destructive SQL operations are not allowed" };
  }

  // Reject access to sensitive tables
  for (const table of BLOCKED_TABLES) {
    if (new RegExp(`\\b${table}\\b`, "i").test(sql)) {
      return { safe: false, reason: `Access to '${table}' is not allowed` };
    }
  }

  return { safe: true };
}

// ---------------------------------------------------------------------------
// Schema fetcher
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runRpc(client: any, query: string): Promise<unknown[]> {
  const { data, error } = await client.client.rpc("exec_sql", { query });
  if (error) throw new Error(`exec_sql error: ${error.message}`);
  return (data as unknown[]) ?? [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchSchema(client: any): Promise<string> {
  // Return cached schema if still fresh
  if (schemaCache && Date.now() - schemaCache.fetchedAt < SCHEMA_CACHE_TTL_MS) {
    return schemaCache.schema;
  }

  const [tables, pks, fks] = await Promise.all([
    runRpc(client, `
      SELECT t.table_name, c.column_name, c.data_type, c.is_nullable
      FROM information_schema.tables t
      JOIN information_schema.columns c
        ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND t.table_name NOT IN ('api_keys')
      ORDER BY t.table_name, c.ordinal_position
    `),
    runRpc(client, `
      SELECT kcu.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
    `),
    runRpc(client, `
      SELECT kcu.table_name AS from_table, kcu.column_name AS from_col,
             ccu.table_name AS to_table, ccu.column_name AS to_col
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    `),
  ]);

  // Build schema string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableMap = new Map<string, { col: string; type: string; nullable: string }[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of tables as any[]) {
    if (!tableMap.has(row.table_name)) tableMap.set(row.table_name, []);
    tableMap.get(row.table_name)!.push({ col: row.column_name, type: row.data_type, nullable: row.is_nullable });
  }

  const pkSet = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pks as any[]).map((r) => `${r.table_name}.${r.column_name}`),
  );

  let out = "";
  for (const [table, cols] of tableMap) {
    out += `Table: ${table}\n`;
    for (const c of cols) {
      const pk = pkSet.has(`${table}.${c.col}`) ? " [PK]" : "";
      const nn = c.nullable === "NO" ? " NOT NULL" : "";
      out += `  ${c.col}: ${c.type}${pk}${nn}\n`;
    }
    out += "\n";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((fks as any[]).length) {
    out += "Foreign Keys:\n";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const fk of fks as any[]) {
      out += `  ${fk.from_table}.${fk.from_col} → ${fk.to_table}.${fk.to_col}\n`;
    }
  }

  schemaCache = { schema: out, fetchedAt: Date.now() };
  return out;
}

// ---------------------------------------------------------------------------
// SQL generation via Gemini
// ---------------------------------------------------------------------------

async function generateSql(question: string, schema: string, userId: string): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("GEMINI_API_KEY not set");

  const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
  const MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.0-flash-lite"];

  const systemPrompt = `You are a PostgreSQL expert for an expense tracking app.
Output ONLY raw SQL — no markdown fences, no backticks, no explanation.
Write a single read-only SELECT or WITH (CTE) query.
NEVER use INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE, GRANT, REVOKE.

Rules:
- Always filter results to the current user using their user_id.
- For transactions: filter with submitted_by = '${userId}' OR payer_id = '${userId}'
- For group data: first find group_ids from group_members where user_id = '${userId}'
- Window functions (LAG, LEAD, RANK) CANNOT be used in WHERE/HAVING — wrap in a CTE first.
- If the question cannot be answered with a SELECT, output exactly: SELECT NULL AS answer WHERE false

Today's date: ${new Date().toISOString().slice(0, 10)}`;

  for (const model of MODELS) {
    const res = await fetch(`${GEMINI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${geminiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Database schema:\n${schema}\n\nQuestion: ${question}` },
        ],
      }),
    });

    if (res.ok) {
      const json = await res.json() as { choices: Array<{ message: { content: string } }> };
      const raw = json.choices?.[0]?.message?.content ?? "";
      // Strip any accidental markdown fences the model adds despite instructions
      return raw.trim().replace(/^```sql\n?/i, "").replace(/\n?```$/i, "").replace(/;$/, "").trim();
    }

    if (res.status === 429 || res.status === 503) continue;
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini SQL generation failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  throw new Error("All Gemini models overloaded — please retry");
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function noToolMatch(
  apiKey: string,
  inputText: string,
): Promise<Record<string, unknown>> {
  // 1. Authenticate
  let ac;
  let userId: string;
  try {
    ac = await getClientForApiKey(apiKey);
    // Use jwtPayload (server-safe) instead of atob (browser-only)
    const claims = jwtPayload(ac.accessToken);
    userId = claims.sub as string;
  } catch (e) {
    return { result: toolError(`Auth failed: ${String(e)}`) };
  }

  // 2. Fetch schema (cached)
  let schema: string;
  try {
    schema = await fetchSchema(ac);
    if (!schema.trim()) {
      return {
        result: toolError(
          "Database schema is empty — ensure exec_sql RPC exists in Supabase. " +
          "Run: CREATE FUNCTION exec_sql(query text) RETURNS jsonb ... in Supabase SQL editor.",
        ),
      };
    }
  } catch (e) {
    return {
      result: toolError(
        `Schema fetch failed: ${String(e)}. ` +
        "The exec_sql RPC may not exist yet in your Supabase project.",
      ),
    };
  }

  // 3. Generate SQL via Gemini
  let sql: string;
  try {
    sql = await generateSql(inputText, schema, userId);
  } catch (e) {
    return { result: toolError(`SQL generation failed: ${String(e)}`) };
  }

  // 4. Validate
  const check = isSafeSql(sql);
  if (!check.safe) {
    return {
      result: toolError(`Generated query rejected: ${check.reason}. Raw: ${sql.slice(0, 100)}`),
    };
  }

  // 5. Execute
  try {
    const rows = await runRpc(ac, sql);
    return {
      result: {
        status: "success",
        data: rows,
        // Return the SQL so the UI can display it in a "Show query" toggle
        generated_sql: sql,
        row_count: Array.isArray(rows) ? rows.length : 0,
      },
    };
  } catch (e) {
    return {
      result: toolError(`Query execution failed: ${String(e)}`),
    };
  }
}
