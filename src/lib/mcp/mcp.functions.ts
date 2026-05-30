/**
 * TanStack Start server functions — the only bridge between browser and DB layer.
 *
 * All tool calls go through callTool() in the dispatcher, which routes to the
 * correct TypeScript handler. No HTTP round-trip to an external MCP server.
 *
 * The interface is identical to before so all routes work unchanged.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { callTool, listTools } from "../db/dispatcher.server";

// Re-export outcome type so routes can import from one place
export type { ToolCallOutcome } from "../db/dispatcher.server";

// ---------------------------------------------------------------------------
// Generic tool call (api_key injected server-side, never trusted from browser)
// ---------------------------------------------------------------------------

const callInput = z.object({
  apiKey: z.string().min(1),
  name: z.string().min(1).max(80),
  args: z.record(z.unknown()).default({}),
});

export const mcpCall = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => callInput.parse(d))
  .handler(async ({ data }) => {
    return callTool(data.apiKey, data.name, data.args as Record<string, unknown>);
  });

// ---------------------------------------------------------------------------
// Tool discovery (used by the AI chat to build its tool list)
// ---------------------------------------------------------------------------

export const mcpListTools = createServerFn({ method: "GET" }).handler(async () => {
  return { tools: listTools() };
});

// ---------------------------------------------------------------------------
// Auth helpers — no api_key required, tool returns it
// ---------------------------------------------------------------------------

const registerInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().max(100).default(""),
});

export const mcpRegister = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => registerInput.parse(d))
  .handler(async ({ data }) => {
    return callTool("", "register_new_user", {
      email: data.email,
      password: data.password,
      full_name: data.full_name,
    });
  });

const loginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const mcpLogin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => loginInput.parse(d))
  .handler(async ({ data }) => {
    return callTool("", "login_get_api_key", {
      email: data.email,
      password: data.password,
    });
  });