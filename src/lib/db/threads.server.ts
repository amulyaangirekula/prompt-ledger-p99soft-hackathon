/**
 * Thread persistence — stores and retrieves chat conversations in MongoDB.
 */

import { getDb } from "./mongo.server";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface Thread {
  threadId: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface ThreadSummary {
  threadId: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export const MEMORY_TURNS = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function col() {
  return getDb().then((db) => db.collection("threads"));
}

function makeTitle(firstUserMessage: string): string {
  const cleaned = firstUserMessage.replace(/\s+/g, " ").trim();
  return cleaned.length > 60 ? cleaned.slice(0, 57) + "…" : cleaned;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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

export async function listThreads(
  userId: string,
  limit = 20,
): Promise<ThreadSummary[]> {
  const c = await col();

  const threads = await c
    .find(
      { userId },
      {
        projection: {
          _id: 0,
          threadId: 1,
          title: 1,
          updatedAt: 1,
          messages: 1,
        },
      },
    )
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();

  return threads.map((t: any) => ({
    threadId: t.threadId,
    title: t.title,
    updatedAt:
      t.updatedAt instanceof Date
        ? t.updatedAt.toISOString()
        : new Date(t.updatedAt).toISOString(),
    messageCount: t.messages?.length ?? 0,
  }));
}

export async function getThread(
  threadId: string,
  userId: string,
): Promise<Thread | null> {
  const c = await col();

  const thread: any = await c.findOne(
    { threadId, userId },
    {
      projection: {
        _id: 0,
      },
    },
  );

  if (!thread) return null;

  return {
    threadId: thread.threadId,
    userId: thread.userId,
    title: thread.title,
    createdAt:
      thread.createdAt instanceof Date
        ? thread.createdAt.toISOString()
        : new Date(thread.createdAt).toISOString(),
    updatedAt:
      thread.updatedAt instanceof Date
        ? thread.updatedAt.toISOString()
        : new Date(thread.updatedAt).toISOString(),
    messages: (thread.messages ?? []).map((m: any) => ({
      role: m.role,
      content: m.content,
      timestamp:
        m.timestamp instanceof Date
          ? m.timestamp.toISOString()
          : new Date(m.timestamp).toISOString(),
    })),
  };
}

export async function appendMessages(
  threadId: string,
  userId: string,
  userContent: string,
  assistantContent: string,
): Promise<void> {
  const c = await col();
  const now = new Date();

  const existing: any = await c.findOne(
    { threadId, userId },
    {
      projection: {
        title: 1,
        messages: 1,
      },
    },
  );

  const newMessages = [
    {
      role: "user",
      content: userContent,
      timestamp: now,
    },
    {
      role: "assistant",
      content: assistantContent,
      timestamp: now,
    },
  ];

  if (!existing) {
    await c.updateOne(
      { threadId, userId },
      {
        $setOnInsert: {
          threadId,
          userId,
          createdAt: now,
        },
        $set: {
          title: makeTitle(userContent),
          updatedAt: now,
        },
        $push: {
          messages: {
            $each: newMessages,
          } as never,
        },
      },
      { upsert: true },
    );

    return;
  }

  const isFirstMessage = (existing.messages?.length ?? 0) === 0;

  const updateDoc: Record<string, unknown> = {
    $set: {
      updatedAt: now,
    },
    $push: {
      messages: {
        $each: newMessages,
      } as never,
    },
  };

  if (isFirstMessage) {
    (updateDoc.$set as Record<string, unknown>).title =
      makeTitle(userContent);
  }

  await c.updateOne(
    { threadId, userId },
    updateDoc,
  );
}

export async function getMemoryContext(
  threadId: string,
  userId: string,
  turns = MEMORY_TURNS,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const c = await col();

  const thread: any = await c.findOne(
    { threadId, userId },
    {
      projection: {
        messages: 1,
      },
    },
  );

  if (!thread?.messages?.length) return [];

  const takeMessages = turns * 2;
  const recent = thread.messages.slice(-takeMessages);

  return recent.map((m: any) => ({
    role: m.role,
    content: m.content,
  }));
}

export async function deleteThread(
  threadId: string,
  userId: string,
): Promise<void> {
  const c = await col();
  await c.deleteOne({ threadId, userId });
}

export async function ensureIndexes(): Promise<void> {
  const c = await col();

  await Promise.all([
    c.createIndex({ userId: 1, updatedAt: -1 }),
    c.createIndex({ threadId: 1 }, { unique: true }),
  ]);
}