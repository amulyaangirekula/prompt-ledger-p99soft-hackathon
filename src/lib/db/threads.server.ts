/**
 * Thread persistence — stores and retrieves chat conversations in MongoDB.
 *
 * Schema:
 *   Collection: threads
 *   {
 *     _id: ObjectId,
 *     threadId: string,       // UUID — stable public identifier
 *     userId: string,         // Supabase JWT sub
 *     title: string,          // first user message, max 60 chars
 *     createdAt: Date,
 *     updatedAt: Date,
 *     messages: ChatMessage[]
 *   }
 *
 * Memory strategy: only the last MEMORY_TURNS turns are sent to Gemini
 * to keep token usage bounded on the free tier.
 */

import { getDb } from "./mongo.server";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface Thread {
  threadId: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ChatMessage[];
}

export interface ThreadSummary {
  threadId: string;
  title: string;
  updatedAt: Date;
  messageCount: number;
}

// How many recent turns (user+assistant pairs) to inject as memory context
export const MEMORY_TURNS = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function col() {
  return getDb().then((db) => db.collection<Thread>("threads"));
}

function makeTitle(firstUserMessage: string): string {
  const cleaned = firstUserMessage.replace(/\s+/g, " ").trim();
  return cleaned.length > 60 ? cleaned.slice(0, 57) + "…" : cleaned;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Create a new empty thread. Returns the threadId. */
export async function createThread(userId: string): Promise<string> {
  const c = await col();
  const threadId = randomUUID();
  const now = new Date();
  await c.insertOne({
    threadId,
    userId,
    title: "New conversation",
    createdAt: now,
    updatedAt: now,
    messages: [],
  });
  return threadId;
}

/** List the most recent threads for a user (no messages — just metadata). */
export async function listThreads(userId: string, limit = 20): Promise<ThreadSummary[]> {
  const c = await col();
  const threads = await c
    .find({ userId }, { projection: { _id: 0, threadId: 1, title: 1, updatedAt: 1, messages: 1 } })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();

  return threads.map((t) => ({
    threadId: t.threadId,
    title: t.title,
    // Convert Date → ISO string so seroval can serialize it
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt : new Date(t.updatedAt),
    messageCount: t.messages?.length ?? 0,
  }));
}

/** Get a single thread with all messages. Returns null if not found or wrong user. */
export async function getThread(threadId: string, userId: string): Promise<Thread | null> {
  const c = await col();
  const thread = await c.findOne(
    { threadId, userId },
    { projection: { _id: 0 } }, // exclude ObjectId — seroval can't serialize it
  );
  if (!thread) return null;

  // Ensure all Dates and nested Dates are plain serializable values
  return {
    threadId: thread.threadId,
    userId: thread.userId,
    title: thread.title,
    createdAt: thread.createdAt instanceof Date ? thread.createdAt : new Date(thread.createdAt),
    updatedAt: thread.updatedAt instanceof Date ? thread.updatedAt : new Date(thread.updatedAt),
    messages: (thread.messages ?? []).map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp),
    })),
  };
}

/**
 * Append a user+assistant message pair to a thread.
 * Creates the thread if it doesn't exist yet.
 * Sets the title from the first user message.
 */
export async function appendMessages(
  threadId: string,
  userId: string,
  userContent: string,
  assistantContent: string,
): Promise<void> {
  const c = await col();
  const now = new Date();

  const existing = await c.findOne({ threadId, userId }, { projection: { title: 1, messages: 1 } });

  const newMessages: ChatMessage[] = [
    { role: "user", content: userContent, timestamp: now },
    { role: "assistant", content: assistantContent, timestamp: now },
  ];

  if (!existing) {
    // Thread was created client-side but not yet in DB — upsert it
    await c.updateOne(
      { threadId, userId },
      {
        $setOnInsert: { threadId, userId, createdAt: now },
        $set: {
          title: makeTitle(userContent),
          updatedAt: now,
        },
        $push: { messages: { $each: newMessages } as never },
      },
      { upsert: true },
    );
    return;
  }

  const isFirstMessage = (existing.messages?.length ?? 0) === 0;
  const updateDoc: Record<string, unknown> = {
    $set: { updatedAt: now },
    $push: { messages: { $each: newMessages } as never },
  };

  if (isFirstMessage) {
    (updateDoc.$set as Record<string, unknown>).title = makeTitle(userContent);
  }

  await c.updateOne({ threadId, userId }, updateDoc);
}

/**
 * Get the last N turns of a thread as Gemini-format messages.
 * Used to inject memory context into the chat API.
 * Returns [{role, content}, ...] — no timestamps.
 */
export async function getMemoryContext(
  threadId: string,
  userId: string,
  turns = MEMORY_TURNS,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const c = await col();
  const thread = await c.findOne(
    { threadId, userId },
    { projection: { messages: 1 } },
  );
  if (!thread?.messages?.length) return [];

  // Each "turn" = 1 user + 1 assistant message = 2 messages
  const takeMessages = turns * 2;
  const recent = thread.messages.slice(-takeMessages);

  return recent.map((m) => ({ role: m.role, content: m.content }));
}

/** Delete a thread. Silently ignores if not found or wrong user. */
export async function deleteThread(threadId: string, userId: string): Promise<void> {
  const c = await col();
  await c.deleteOne({ threadId, userId });
}

/** Ensure indexes exist — call once at startup or lazily. */
export async function ensureIndexes(): Promise<void> {
  const c = await col();
  await Promise.all([
    c.createIndex({ userId: 1, updatedAt: -1 }),
    c.createIndex({ threadId: 1 }, { unique: true }),
  ]);
}
