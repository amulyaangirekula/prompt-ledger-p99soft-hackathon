/**
 * Supabase client factory + API-key auth flow.
 *
 * Mirrors the Python supabase_client.py exactly:
 *   api_key → fn_validate_and_lock_api_key → refresh_token
 *           → auth.refreshSession → access_token (JWT)
 *           → fn_update_api_key_refresh_token (persist rotated token)
 *
 * Single Responsibility: only knows how to create authenticated clients.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getConfig(): { url: string; anonKey: string } {
  const url = process.env.SUPABASE_URL ?? "";
  const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env");
  }
  return { url, anonKey };
}

/** Service-role client — only for server-side admin queries (e.g. auth.users). */
export function getServiceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ---------------------------------------------------------------------------
// Value objects
// ---------------------------------------------------------------------------

export interface AuthedClient {
  client: SupabaseClient;
  accessToken: string;
}

// ---------------------------------------------------------------------------
// Public factories
// ---------------------------------------------------------------------------

/** Unauthenticated client — for register / login only. */
export function getAnonClient(): SupabaseClient {
  const { url, anonKey } = getConfig();
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Validate api_key, exchange stored refresh token for a fresh JWT.
 * Stateless and restart-safe — mirrors get_client_for_api_key() in Python.
 */
export async function getClientForApiKey(apiKey: string): Promise<AuthedClient> {
  const { url, anonKey } = getConfig();
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Validate key + retrieve stored refresh token (SELECT FOR UPDATE prevents races)
  const { data: lockData, error: lockErr } = await anon.rpc("fn_validate_and_lock_api_key", {
    p_api_key: apiKey,
  });
  if (lockErr) throw new Error(`API key validation failed: ${lockErr.message}`);

  const row = Array.isArray(lockData) ? lockData[0] : lockData;
  if (!row || row.status !== "success") {
    throw new Error("Invalid or expired API key. Call login_get_api_key to get a new one.");
  }

  const refreshToken: string = row.refresh_token;
  if (!refreshToken) {
    throw new Error("No session stored for this API key. Call login_get_api_key once to save your session.");
  }

  // 2. Exchange refresh token → fresh access token
  const { data: sessionData, error: sessionErr } = await anon.auth.refreshSession({ refresh_token: refreshToken });
  if (sessionErr || !sessionData.session) {
    throw new Error("Session expired. Call login_get_api_key to get a fresh session.");
  }

  const accessToken = sessionData.session.access_token;
  const newRefresh = sessionData.session.refresh_token ?? refreshToken;

  // 3. Build authenticated client
  const authed = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  // 4. Persist rotated refresh token (security-definer RPC)
  await authed.rpc("fn_update_api_key_refresh_token", {
    p_api_key: apiKey,
    p_refresh_token: newRefresh,
  });

  return { client: authed, accessToken };
}
