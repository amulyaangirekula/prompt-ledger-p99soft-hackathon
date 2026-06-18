/**
 * TanStack Start server functions for thread management.
 * These are the only bridge between browser and MongoDB.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getClientForApiKey } from "./supabase.server";
import { jwtPayload } from "./jwt.server";
import {
  createThread,
  listThreads,
  getThread,
  deleteThread,
  ensureIndexes,
  type ThreadSummary,
  type Thread,
} from "./threads.server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getUserId(apiKey: string): Promise<string> {
  const ac = await getClientForApiKey(apiKey);
  const payload = jwtPayload(ac.accessToken);
  return payload.sub as string;
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

const apiKeyInput = z.object({ apiKey: z.string().min(1) });

/** List all threads for the current user (metadata only, no messages). */
export const listUserThreads = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ apiKey: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<ThreadSummary[]> => {
    try {
      const userId = await getUserId(data.apiKey);
      await ensureIndexes();
      return await listThreads(userId);
    } catch (error) {
      console.error("Error in listUserThreads server function:", error);
      throw error;
    }
  });

/** Get a single thread with all messages. */
export const getThreadById = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ apiKey: z.string().min(1), threadId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }): Promise<Thread | null> => {
    try {
      const userId = await getUserId(data.apiKey);
      return await getThread(data.threadId, userId);
    } catch (error) {
      console.error("Error in getThreadById server function:", error);
      throw error;
    }
  });

/** Create a new thread. Returns the new threadId. */
export const createNewThread = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => apiKeyInput.parse(d))
  .handler(async ({ data }): Promise<{ threadId: string }> => {
    try {
      const userId = await getUserId(data.apiKey);
      await ensureIndexes();
      const threadId = await createThread(userId);
      return { threadId };
    } catch (error) {
      console.error("Error in createNewThread server function:", error);
      throw error;
    }
  });

/** Delete a thread. */
export const deleteThreadById = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ apiKey: z.string().min(1), threadId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    try {
      const userId = await getUserId(data.apiKey);
      await deleteThread(data.threadId, userId);
      return { ok: true };
    } catch (error) {
      console.error("Error in deleteThreadById server function:", error);
      throw error;
    }
  });
