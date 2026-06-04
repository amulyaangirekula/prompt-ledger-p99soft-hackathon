/**
 * MongoDB client — singleton connection for the server process.
 *
 * Single Responsibility: owns the MongoClient lifecycle.
 * All other server modules import `getDb()` from here.
 */

import { MongoClient, type Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

function getUri(): string {
  const uri = process.env.MONGODB_URI ?? "";
  if (!uri) throw new Error("MONGODB_URI is not set in .env");
  return uri;
}

export async function getDb(): Promise<Db> {
  if (db) return db;

  const uri = getUri();
  client = new MongoClient(uri, {
    // Keep alive — avoids cold-connect penalty on every request in dev
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

  await client.connect();
  db = client.db("promptledger");
  return db;
}

/** Call on graceful shutdown — not critical in serverless/Cloudflare but good hygiene. */
export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
