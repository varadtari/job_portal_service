import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

type DB = ReturnType<typeof drizzle<typeof schema>>;

const g = globalThis as unknown as { __db?: DB };

export function db(): DB {
  if (!g.__db) {
    // prepare:false is required for Supabase's transaction-mode pooler (port 6543)
    const client = postgres(env().DATABASE_URL, { prepare: false, max: 5 });
    g.__db = drizzle(client, { schema });
  }
  return g.__db;
}

export { schema };
